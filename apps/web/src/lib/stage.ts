/** Etapa da conversa (funil): rótulo + cor do chip. Usado em Conversas e no Funil. */
export const STAGE_UI: Record<string, { label: string; chip: string; dot: string }> = {
  NOVO_LEAD: { label: "Novo lead", chip: "bg-sky-100 text-sky-800", dot: "#0284C7" }, // legado
  IA_ATENDENDO: { label: "IA atendendo", chip: "bg-sky-100 text-sky-800", dot: "#0284C7" },
  SUPORTE_HUMANO: { label: "Suporte humano", chip: "bg-rose-100 text-rose-800", dot: "#E11D48" },
  INTERESSADO: { label: "Interessado", chip: "bg-orange-100 text-orange-800", dot: "#EA580C" },
  AGENDADO: { label: "Agendado", chip: "bg-emerald-100 text-emerald-800", dot: "#059669" },
  POS_ATENDIMENTO: { label: "Pós-atendimento", chip: "bg-violet-100 text-violet-800", dot: "#7C3AED" },
};

export function stageUi(stage: string) {
  return STAGE_UI[stage] ?? STAGE_UI.IA_ATENDENDO!;
}

/** Iniciais pro avatar circular (nome, ou os 2 últimos dígitos do telefone). */
export function initials(name: string | null | undefined, phone: string) {
  const base = (name ?? "").trim();
  if (!base) return phone.slice(-2);
  const parts = base.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || base.slice(0, 2).toUpperCase();
}
