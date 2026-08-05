/** Fórmulas de negócio. Tudo em number; nunca persistido. */
export const sum = (xs: number[]) => xs.reduce((total, value) => total + value, 0);

export function appointmentProfit(total: number, expenses: number[]): number {
  return total - sum(expenses);
}

export function averageTicket(totalRevenue: number, paidAppointments: number): number {
  return paidAppointments > 0 ? totalRevenue / paidAppointments : 0;
}

export function conversionRate(closedAppointments: number, opportunities: number): number {
  return opportunities > 0 ? closedAppointments / opportunities : 0;
}

export function quoteTotal(itemPrices: number[]): number {
  return sum(itemPrices);
}
