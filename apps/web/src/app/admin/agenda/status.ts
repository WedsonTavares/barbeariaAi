/** Cores e rótulos de status da reserva — usados no calendário e no modal. */
export const STATUS_UI: Record<string, { label: string; dot: string; chip: string; bar: string }> = {
  LEAD:            { label: "Lead",              dot: "bg-slate-400",  chip: "bg-slate-100 text-slate-700",   bar: "#94A3B8" },
  QUOTE_SENT:      { label: "Orçamento enviado", dot: "bg-amber-400",  chip: "bg-amber-100 text-amber-800",   bar: "#FBBF24" },
  WAITING_DEPOSIT: { label: "Aguardando sinal",  dot: "bg-orange-500", chip: "bg-orange-100 text-orange-800", bar: "#F97316" },
  CONFIRMED:       { label: "Confirmada",        dot: "bg-blue-500",   chip: "bg-blue-100 text-blue-800",     bar: "#3B82F6" },
  IN_DELIVERY:     { label: "Em entrega",        dot: "bg-purple-500", chip: "bg-purple-100 text-purple-800", bar: "#A855F7" },
  MOUNTED:         { label: "Montado",           dot: "bg-fuchsia-600",chip: "bg-fuchsia-100 text-fuchsia-800", bar: "#C026D3" },
  PICKED_UP:       { label: "Retirado",          dot: "bg-teal-500",   chip: "bg-teal-100 text-teal-800",     bar: "#14B8A6" },
  FINISHED:        { label: "Finalizada",        dot: "bg-green-600",  chip: "bg-green-100 text-green-800",   bar: "#16A34A" },
  CANCELED:        { label: "Cancelada",         dot: "bg-red-400",    chip: "bg-red-100 text-red-700",       bar: "#F87171" },
};

export const PAYMENT_UI: Record<string, { label: string; chip: string }> = {
  PENDING:      { label: "Pagamento pendente", chip: "bg-slate-100 text-slate-700" },
  DEPOSIT_PAID: { label: "Sinal pago",         chip: "bg-blue-100 text-blue-800" },
  PAID:         { label: "Pago",               chip: "bg-green-100 text-green-800" },
  OVERDUE:      { label: "Atrasado",           chip: "bg-red-100 text-red-700" },
  REFUNDED:     { label: "Reembolsado",        chip: "bg-amber-100 text-amber-800" },
};

/** Legenda do calendário (agrupada por fase, pra não poluir). */
export const LEGEND = [
  { label: "Orçamento / aguardando", bar: "#FBBF24" },
  { label: "Confirmada", bar: "#3B82F6" },
  { label: "Em operação", bar: "#A855F7" },
  { label: "Retirada / finalizada", bar: "#16A34A" },
  { label: "Cancelada", bar: "#F87171" },
];

export const ui = (status: string) => STATUS_UI[status] ?? STATUS_UI.LEAD!;
