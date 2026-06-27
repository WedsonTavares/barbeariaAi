import { withTenant } from "../db/withTenant";
import { averageTicket } from "../calculations";

function monthRange(ref: Date) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  return { start, end };
}

export const financeService = {
  /** Resumo financeiro do mês de `ref`. */
  monthSummary: (tenantId: string, ref = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const { start, end } = monthRange(ref);
      const payments = await tx.payment.aggregate({
        where: { paidAt: { gte: start, lt: end } },
        _sum: { amount: true },
      });
      const expenses = await tx.expense.aggregate({
        where: { date: { gte: start, lt: end } },
        _sum: { amount: true },
      });
      const bookings = await tx.booking.findMany({
        where: { eventDate: { gte: start, lt: end }, status: { not: "CANCELED" } },
        include: { payments: true },
      });
      const faturamento = Number(payments._sum.amount ?? 0);
      const custos = Number(expenses._sum.amount ?? 0);
      const aReceber = bookings.reduce((s, b) => {
        const paid = b.payments.reduce((p, x) => p + Number(x.amount), 0);
        return s + Math.max(0, Number(b.total) - paid);
      }, 0);
      const pagas = bookings.filter((b) => b.paymentStatus === "PAID").length;
      return {
        faturamentoBruto: faturamento,
        custos,
        lucroEstimado: faturamento - custos,
        aReceber,
        ticketMedio: averageTicket(faturamento, pagas),
        reservasNoMes: bookings.length,
      };
    }),

  /** Métricas para os cards do dashboard. */
  dashboard: (tenantId: string, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endToday = new Date(startToday.getTime() + 86_400_000);
      const in48h = new Date(now.getTime() + 48 * 3_600_000);

      const [reservasHoje, proximasRetiradas, sinaisPendentes, brinquedosDisponiveis, emManutencao, orcamentosAbertos] =
        await Promise.all([
          tx.booking.count({ where: { eventDate: { gte: startToday, lt: endToday }, status: { not: "CANCELED" } } }),
          tx.booking.findMany({
            where: { pickupTime: { gte: now, lt: in48h }, status: { in: ["CONFIRMED", "MOUNTED", "IN_DELIVERY"] } },
            include: { customer: true },
            orderBy: { pickupTime: "asc" },
            take: 10,
          }),
          tx.booking.count({ where: { paymentStatus: { in: ["PENDING", "DEPOSIT_PAID", "OVERDUE"] }, status: { not: "CANCELED" } } }),
          tx.toy.count({ where: { status: "AVAILABLE" } }),
          tx.toy.count({ where: { status: "MAINTENANCE" } }),
          tx.lead.count({ where: { status: { in: ["NEW", "CONTACTED", "QUOTED"] } } }),
        ]);

      return { reservasHoje, proximasRetiradas, sinaisPendentes, brinquedosDisponiveis, emManutencao, orcamentosAbertos };
    }),
};
