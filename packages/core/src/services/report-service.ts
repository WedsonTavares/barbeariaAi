import { withTenant } from "../db/withTenant";
import { spMonthRange } from "../time";
import { remainingToRecover } from "../calculations";

export interface MonthlyRow {
  label: string; // "07/2026"
  revenue: number; // pagamentos recebidos no mês (fuso SP)
  bookings: number; // festas do mês (não canceladas)
}

export interface ToyReportRow {
  id: string;
  name: string;
  status: string;
  rentals: number; // locações (reservas não canceladas)
  revenue: number; // receita gerada (soma dos preços de item)
  purchasePrice: number;
  remaining: number; // quanto falta para se pagar
  paidOff: boolean;
}

export const reportService = {
  /** Relatórios do painel: receita por mês + ranking/payback por brinquedo. */
  overview: (tenantId: string, months = 6, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const monthly: MonthlyRow[] = [];
      for (let i = months - 1; i >= 0; i--) {
        // dia 15 evita ambiguidade de borda de mês entre UTC e SP
        const ref = new Date(now.getFullYear(), now.getMonth() - i, 15);
        const { start, end } = spMonthRange(ref);
        const pay = await tx.payment.aggregate({
          where: { paidAt: { gte: start, lt: end } },
          _sum: { amount: true },
        });
        const bookings = await tx.booking.count({
          where: { eventDate: { gte: start, lt: end }, status: { not: "CANCELED" } },
        });
        monthly.push({
          label: `${String(ref.getMonth() + 1).padStart(2, "0")}/${ref.getFullYear()}`,
          revenue: Number(pay._sum.amount ?? 0),
          bookings,
        });
      }

      const toys = await tx.toy.findMany({
        include: {
          bookingItems: {
            where: { booking: { status: { not: "CANCELED" } } },
            select: { price: true },
          },
        },
      });
      const ranking: ToyReportRow[] = toys
        .map((t) => {
          const rentals = t.bookingItems.length;
          const revenue = t.bookingItems.reduce((s, i) => s + Number(i.price), 0);
          const purchasePrice = Number(t.purchasePrice);
          const remaining = remainingToRecover(purchasePrice, revenue);
          return {
            id: t.id,
            name: t.name,
            status: t.status,
            rentals,
            revenue,
            purchasePrice,
            remaining,
            paidOff: remaining <= 0 && purchasePrice > 0,
          };
        })
        .sort((a, b) => b.rentals - a.rentals || b.revenue - a.revenue);

      return { monthly, ranking };
    }),
};
