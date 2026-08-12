import type { ProspectCanal, ProspectMotivoPerda, ProspectStage } from "@barbearia-ai/core";

export type LeadView = {
  id: string;
  nome: string;
  nicho: string;
  telefone: string | null;
  site: string | null;
  maps: string | null;
  endereco: string | null;
  nota: number | null;
  avaliacoes: number;
  score: number;
  motivos: string[];
  stage: ProspectStage;
  contatadoEm: string | null;
  observacao: string | null;
  proximaAcao: string | null;
  proximaAcaoEm: string | null;
  motivoPerda: ProspectMotivoPerda | null;
  /** Resumo do último toque, para a lista e o card sem carregar o histórico. */
  ultimaInteracao: { resumo: string; canal: ProspectCanal; criadoEm: string } | null;
};

export type Interacao = {
  id: string;
  canal: ProspectCanal;
  resumo: string;
  paraStage: ProspectStage | null;
  criadoEm: string;
};

/** Ordem do funil. É a sequência real da abordagem — o quadro e o gráfico dependem dela. */
export const FUNIL: { stage: ProspectStage; rotulo: string }[] = [
  { stage: "NOVO", rotulo: "Novo" },
  { stage: "CONTATADO", rotulo: "Contatado" },
  { stage: "RESPONDEU", rotulo: "Respondeu" },
  { stage: "DEMO", rotulo: "Demo" },
  { stage: "PROPOSTA", rotulo: "Proposta" },
  { stage: "GANHO", rotulo: "Ganho" },
];

export const TODOS_ESTAGIOS: ProspectStage[] = [...FUNIL.map((f) => f.stage), "PERDIDO"];

export const ROTULO_ESTAGIO: Record<ProspectStage, string> = {
  NOVO: "Novo",
  CONTATADO: "Contatado",
  RESPONDEU: "Respondeu",
  DEMO: "Demo",
  PROPOSTA: "Proposta",
  GANHO: "Ganho",
  PERDIDO: "Perdido",
};

/**
 * Cores de ESTADO, não de série. Só ganho e perdido recebem cor semântica; as
 * etapas do meio ficam num degradê neutro de propósito — pintar cada uma de uma
 * cor faria o olho procurar significado onde só existe ordem.
 */
export const COR_ESTAGIO: Record<ProspectStage, string> = {
  NOVO: "bg-slate-100 text-slate-700",
  CONTATADO: "bg-blue-50 text-blue-700",
  RESPONDEU: "bg-blue-100 text-blue-800",
  DEMO: "bg-indigo-100 text-indigo-800",
  PROPOSTA: "bg-amber-100 text-amber-800",
  GANHO: "bg-emerald-100 text-emerald-800",
  PERDIDO: "bg-red-100 text-red-700",
};

export const ROTULO_CANAL: Record<ProspectCanal, string> = {
  LIGACAO: "Ligação",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  REUNIAO: "Reunião",
  PRESENCIAL: "Presencial",
  OUTRO: "Outro",
};

export const MOTIVOS_PERDA: { valor: ProspectMotivoPerda; rotulo: string }[] = [
  { valor: "NAO_RESPONDEU", rotulo: "Não respondeu" },
  { valor: "SEM_INTERESSE", rotulo: "Sem interesse" },
  { valor: "JA_TEM_FORNECEDOR", rotulo: "Já tem fornecedor" },
  { valor: "NAO_VE_NECESSIDADE", rotulo: "Não vê necessidade" },
  { valor: "PRECO", rotulo: "Preço" },
  { valor: "SEM_ORCAMENTO", rotulo: "Sem orçamento" },
  { valor: "MOMENTO_INADEQUADO", rotulo: "Momento inadequado" },
  { valor: "CONTATO_INVALIDO", rotulo: "Contato inválido" },
  { valor: "FORA_DO_PERFIL", rotulo: "Fora do perfil" },
  { valor: "OUTRO", rotulo: "Outro" },
];

export const ROTULO_MOTIVO = Object.fromEntries(
  MOTIVOS_PERDA.map((m) => [m.valor, m.rotulo])
) as Record<ProspectMotivoPerda, string>;

/** Lead encerrado não tem próxima ação nem entra na conta de atrasados. */
export const ENCERRADOS: ProspectStage[] = ["GANHO", "PERDIDO"];

/** Presença digital: o sinal que decide qual oferta levar. */
export function presencaDe(l: LeadView): "Sem site" | "Só rede social" | "Site próprio" {
  if (!l.site) return "Sem site";
  return /instagram\.|facebook\.|linktr\.ee|linktree|wa\.me|beacons\.|api\.whatsapp/.test(l.site.toLowerCase())
    ? "Só rede social"
    : "Site próprio";
}

const DIA = 86_400_000;

/** Compara por DIA: um follow-up marcado para hoje não está atrasado. */
export function diasAte(iso: string | null): number | null {
  if (!iso) return null;
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((dia(new Date(iso)) - dia(new Date())) / DIA);
}

export function estaAtrasado(l: LeadView): boolean {
  if (ENCERRADOS.includes(l.stage)) return false;
  const d = diasAte(l.proximaAcaoEm);
  return d !== null && d < 0;
}

/**
 * Lead ativo, já contatado e SEM próxima ação marcada.
 *
 * É o caso mais perigoso do processo: não aparece em atrasados (não tem data),
 * não está no topo da lista, e simplesmente some. Por isso tem indicador próprio.
 */
export function estaLargado(l: LeadView): boolean {
  return !ENCERRADOS.includes(l.stage) && l.stage !== "NOVO" && !l.proximaAcaoEm;
}

export const formatarData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
