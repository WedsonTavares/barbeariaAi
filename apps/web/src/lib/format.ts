// Aceita também Prisma.Decimal (estruturalmente: tem toString()) sem acoplar a @prisma/client.
export const brl = (n: number | string | { toString(): string }) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(n));

export const waUrl = (phone?: string | null, msg?: string) =>
  phone ? `https://wa.me/${phone}${msg ? `?text=${encodeURIComponent(msg)}` : ""}` : "#";
