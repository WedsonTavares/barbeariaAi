/** Fórmulas de negócio (ver DATABASE.md). Tudo em number; nunca persistido. */
export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function bookingProfit(total: number, expenses: number[]): number {
  return total - sum(expenses);
}
export function toyPayback(purchasePrice: number, avgProfitPerRental: number): number | null {
  return avgProfitPerRental > 0 ? purchasePrice / avgProfitPerRental : null;
}
export function remainingToRecover(purchasePrice: number, netRevenueAccumulated: number): number {
  return Math.max(0, purchasePrice - netRevenueAccumulated);
}
export function averageTicket(totalRevenue: number, paidBookings: number): number {
  return paidBookings > 0 ? totalRevenue / paidBookings : 0;
}
export function conversionRate(closedBookings: number, quotesSent: number): number {
  return quotesSent > 0 ? closedBookings / quotesSent : 0;
}

/** Total de um orçamento respeitando a locação mínima do tenant (piso, não multiplicador). */
export function quoteWithMinimum(itemPrices: number[], minRentalPrice: number): number {
  return Math.max(sum(itemPrices), minRentalPrice);
}
