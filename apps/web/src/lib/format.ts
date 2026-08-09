import { APP_TZ } from "@barbearia-ai/core";

export const brl = (n: number | string | { toString(): string }) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(n)
  );

export const waUrl = (phone?: string | null, msg?: string) =>
  phone
    ? `https://wa.me/${phone.replace(/\D/g, "")}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`
    : "#";

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("pt-BR", { timeZone: APP_TZ });

export const fmtDateTime = (d: Date) =>
  d.toLocaleString("pt-BR", {
    timeZone: APP_TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
