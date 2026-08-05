import { withTenant } from "../db/withTenant";
import { spMonthRange } from "../time";

export interface MonthlyRow {
  label: string;
  revenue: number;
  appointments: number;
}

export interface ServiceReportRow {
  id: string;
  name: string;
  status: string;
  appointments: number;
  revenue: number;
}

export const reportService = {
  overview: (tenantId: string, months = 6, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const monthly: MonthlyRow[] = [];
      for (let i = months - 1; i >= 0; i--) {
        const ref = new Date(now.getFullYear(), now.getMonth() - i, 15);
        const { start, end } = spMonthRange(ref);
        const pay = await tx.payment.aggregate({
          where: { paidAt: { gte: start, lt: end } },
          _sum: { amount: true },
        });
        const appointments = await tx.appointment.count({
          where: { startAt: { gte: start, lt: end }, status: { not: "CANCELED" } },
        });
        monthly.push({
          label: `${String(ref.getMonth() + 1).padStart(2, "0")}/${ref.getFullYear()}`,
          revenue: Number(pay._sum.amount ?? 0),
          appointments,
        });
      }

      const services = await tx.service.findMany({
        include: {
          appointments: {
            where: { appointment: { status: { not: "CANCELED" } } },
            select: { price: true },
          },
        },
      });
      const ranking: ServiceReportRow[] = services
        .map((service) => ({
          id: service.id,
          name: service.name,
          status: service.status,
          appointments: service.appointments.length,
          revenue: service.appointments.reduce((sum, item) => sum + Number(item.price), 0),
        }))
        .sort((a, b) => b.appointments - a.appointments || b.revenue - a.revenue);

      return { monthly, ranking };
    }),
};
