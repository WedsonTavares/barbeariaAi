import { withTenant } from "../db/withTenant";
import { averageTicket } from "../calculations";
import { spDayRange, spMonthRange } from "../time";

export const financeService = {
  /** Resumo financeiro do mês de `ref` (mês no fuso de SP, não do servidor). */
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

  /** Métricas para os cards do dashboard ("hoje" = dia no fuso de SP). */
  dashboard: (tenantId: string, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const { start: startToday, end: endToday } = spDayRange(now);
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
          // Sinal REALMENTE pendente: DEPOSIT_PAID fica de fora (o sinal já
          // entrou, o que falta é o saldo) e a festa precisa estar por vir —
          // sem limitar o status, toda festa antiga com saldo em aberto ficava
          // somando nesse contador pra sempre.
          tx.booking.count({
            where: {
              paymentStatus: { in: ["PENDING", "OVERDUE"] },
              status: { in: ["WAITING_DEPOSIT", "CONFIRMED", "IN_DELIVERY", "MOUNTED"] },
            },
          }),
          tx.toy.count({ where: { status: "AVAILABLE" } }),
          tx.toy.count({ where: { status: "MAINTENANCE" } }),
          tx.lead.count({ where: { status: { in: ["NEW", "CONTACTED", "QUOTED"] } } }),
        ]);

      return { reservasHoje, proximasRetiradas, sinaisPendentes, brinquedosDisponiveis, emManutencao, orcamentosAbertos };
    }),
};
