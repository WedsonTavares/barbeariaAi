import { averageTicket } from "../calculations";
import { withTenant } from "../db/withTenant";
import { spDayRange, spMonthRange } from "../time";

export const financeService = {
  monthSummary: (tenantId: string, ref = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const { start, end } = spMonthRange(ref);
      const payments = await tx.payment.aggregate({
        where: { paidAt: { gte: start, lt: end } },
        _sum: { amount: true },
      });
      const expenses = await tx.expense.aggregate({
        where: { date: { gte: start, lt: end } },
        _sum: { amount: true },
      });
      const appointments = await tx.appointment.findMany({
        where: { startAt: { gte: start, lt: end }, status: { not: "CANCELED" } },
        include: { payments: true },
      });
      const compromissosAgenda = await tx.timeOff.count({
        where: { startAt: { lt: end }, endAt: { gt: start } },
      });
      const faturamento = Number(payments._sum.amount ?? 0);
      const custos = Number(expenses._sum.amount ?? 0);
      const aReceber = appointments.reduce((sum, appointment) => {
        const paid = appointment.payments.reduce((total, payment) => total + Number(payment.amount), 0);
        return sum + Math.max(0, Number(appointment.total) - paid);
      }, 0);
      const pagas = appointments.filter((appointment) => appointment.paymentStatus === "PAID").length;
      return {
        faturamentoBruto: faturamento,
        custos,
        lucroEstimado: faturamento - custos,
        aReceber,
        ticketMedio: averageTicket(faturamento, pagas),
        appointmentsNoMes: appointments.length,
        compromissosAgendaNoMes: compromissosAgenda,
      };
    }),

  dashboard: (tenantId: string, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const { start: startToday, end: endToday } = spDayRange(now);
      const in48h = new Date(now.getTime() + 48 * 3_600_000);

      const [
        appointmentsHoje,
        proximosAtendimentos,
        compromissosAgendaHoje,
        proximosCompromissos,
        pagamentosPendentes,
        servicosAtivos,
        profissionaisAtivos,
        orcamentosAbertos,
      ] = await Promise.all([
        tx.appointment.count({ where: { startAt: { gte: startToday, lt: endToday }, status: { not: "CANCELED" } } }),
        tx.appointment.findMany({
          where: { startAt: { gte: now, lt: in48h }, status: { in: ["REQUESTED", "CONFIRMED"] } },
          include: { customer: true, professional: true, services: true },
          orderBy: { startAt: "asc" },
        }),
        tx.timeOff.count({
          where: { startAt: { lt: endToday }, endAt: { gt: startToday } },
        }),
        tx.timeOff.findMany({
          where: { startAt: { lt: in48h }, endAt: { gt: now } },
          include: { professional: true },
          orderBy: { startAt: "asc" },
        }),
        tx.appointment.count({
          where: {
            paymentStatus: { in: ["PENDING", "OVERDUE"] },
            status: { in: ["REQUESTED", "CONFIRMED", "ARRIVED", "IN_SERVICE"] },
          },
        }),
        tx.service.count({ where: { status: "ACTIVE" } }),
        tx.professional.count({ where: { status: "ACTIVE" } }),
        tx.lead.count({ where: { status: { in: ["NEW", "CONTACTED", "QUOTED"] } } }),
      ]);

      return {
        appointmentsHoje,
        proximosAtendimentos,
        compromissosAgendaHoje,
        proximosCompromissos,
        pagamentosPendentes,
        servicosAtivos,
        profissionaisAtivos,
        orcamentosAbertos,
      };
    }),
};
