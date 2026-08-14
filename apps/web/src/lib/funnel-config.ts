export const SYSTEM_FUNNEL_COLUMNS = [
  {
    id: "IA_ATENDENDO",
    label: "IA Atendendo",
    head: "bg-sky-100 text-sky-900",
    hint: "Dinha conduzindo",
  },
  {
    id: "SUPORTE_HUMANO",
    label: "Precisa de Suporte",
    head: "bg-rose-100 text-rose-900",
    hint: "IA pausada",
  },
  {
    id: "INTERESSADO",
    label: "Interessado",
    head: "bg-orange-100 text-orange-900",
    hint: "Quis, não fechou",
  },
  {
    id: "AGENDADO",
    label: "Agendado",
    head: "bg-emerald-100 text-emerald-900",
    hint: "Atendimento marcado",
  },
  {
    id: "POS_ATENDIMENTO",
    label: "Pós-atendimento",
    head: "bg-violet-100 text-violet-900",
    hint: "Acompanhamento",
  },
] as const;

export type SystemFunnelColumnId = (typeof SYSTEM_FUNNEL_COLUMNS)[number]["id"];

export type FunnelColumnConfig = {
  id: string;
  kind: "system" | "custom";
  label: string;
  visible: boolean;
};

export type FunnelColumnView = FunnelColumnConfig & {
  head: string;
  hint: string;
};

export type FunnelConfig = {
  version: 1;
  columns: FunnelColumnConfig[];
};

const SYSTEM_IDS = new Set<string>(SYSTEM_FUNNEL_COLUMNS.map((column) => column.id));
const CUSTOM_ID = /^custom_[a-z0-9_-]{8,64}$/;

export function isSystemFunnelColumn(id: string): id is SystemFunnelColumnId {
  return SYSTEM_IDS.has(id);
}

export function defaultFunnelConfig(): FunnelConfig {
  return {
    version: 1,
    columns: SYSTEM_FUNNEL_COLUMNS.map((column) => ({
      id: column.id,
      kind: "system",
      label: column.label,
      visible: true,
    })),
  };
}

/**
 * Configuração tolerante a dados antigos ou incompletos.
 *
 * Colunas do sistema nunca somem do JSON: se uma configuração antiga não as
 * trouxer, entram no fim com o padrão. Customizações inválidas são ignoradas
 * em vez de derrubar o funil inteiro.
 */
export function normalizeFunnelConfig(value: unknown): FunnelConfig {
  const rawColumns =
    value && typeof value === "object" && !Array.isArray(value) &&
    Array.isArray((value as { columns?: unknown }).columns)
      ? (value as { columns: unknown[] }).columns
      : [];

  const columns: FunnelColumnConfig[] = [];
  const seen = new Set<string>();

  for (const raw of rawColumns) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : "";
    if (!id || seen.has(id)) continue;

    const system = isSystemFunnelColumn(id);
    if (!system && !CUSTOM_ID.test(id)) continue;
    if (!system && columns.filter((column) => column.kind === "custom").length >= 10) continue;

    const fallback = SYSTEM_FUNNEL_COLUMNS.find((column) => column.id === id)?.label ?? "Coluna";
    const label = typeof item.label === "string" ? item.label.trim().slice(0, 40) : "";
    columns.push({
      id,
      kind: system ? "system" : "custom",
      label: label || fallback,
      visible: item.visible !== false,
    });
    seen.add(id);
  }

  for (const system of SYSTEM_FUNNEL_COLUMNS) {
    if (seen.has(system.id)) continue;
    columns.push({ id: system.id, kind: "system", label: system.label, visible: true });
  }

  if (!columns.some((column) => column.visible)) columns[0]!.visible = true;
  return { version: 1, columns };
}

export function funnelColumnViews(value: unknown): FunnelColumnView[] {
  return normalizeFunnelConfig(value).columns.map((column) => {
    const system = SYSTEM_FUNNEL_COLUMNS.find((item) => item.id === column.id);
    return {
      ...column,
      head: system?.head ?? "bg-slate-100 text-slate-900",
      hint: system?.hint ?? "Sem automação",
    };
  });
}
