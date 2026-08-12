import type {
  ProspectCanal,
  ProspectMotivoPerda,
  ProspectResultado,
  ProspectStage,
} from "@barbearia-ai/core";

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
  decisorNome: string | null;
  decisorCargo: string | null;
  decisorTelefone: string | null;
  /** Resumo do último toque, para a lista e o card sem carregar o histórico. */
  ultimaInteracao: {
    resumo: string;
    canal: ProspectCanal;
    resultado: ProspectResultado | null;
    criadoEm: string;
  } | null;
};

export type Interacao = {
  id: string;
  canal: ProspectCanal;
  resultado: ProspectResultado | null;
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

/**
 * O que saiu do contato, e para onde isso normalmente leva o lead.
 *
 * O `sugere` existe para você não ter que escolher a etapa toda vez: quem
 * registra "demo realizada" quase sempre quer o lead em DEMO. É sugestão, não
 * regra — a etapa continua editável, porque exceção existe.
 *
 * `null` em `sugere` = não mexe na etapa. É o caso de "não respondeu": tentar
 * falar não faz o lead avançar, e promover aí inflaria a taxa de conversão.
 */
export const RESULTADOS: {
  valor: ProspectResultado;
  rotulo: string;
  sugere: ProspectStage | null;
}[] = [
  { valor: "NAO_RESPONDEU", rotulo: "Não respondeu", sugere: null },
  { valor: "FALEI_FUNCIONARIO", rotulo: "Falei com funcionário", sugere: null },
  { valor: "FALEI_RESPONSAVEL", rotulo: "Falei com o responsável", sugere: "RESPONDEU" },
  { valor: "PEDIU_INFO", rotulo: "Pediu mais informações", sugere: "RESPONDEU" },
  { valor: "DEMONSTROU_INTERESSE", rotulo: "Demonstrou interesse", sugere: "RESPONDEU" },
  { valor: "DEMO_REALIZADA", rotulo: "Demo realizada", sugere: "DEMO" },
  { valor: "PROPOSTA_ENVIADA", rotulo: "Proposta enviada", sugere: "PROPOSTA" },
  { valor: "RETORNAR_DEPOIS", rotulo: "Pediu para retornar depois", sugere: null },
  { valor: "SEM_INTERESSE", rotulo: "Sem interesse", sugere: "PERDIDO" },
  { valor: "OUTRO", rotulo: "Outro", sugere: null },
];

export const ROTULO_RESULTADO = Object.fromEntries(
  RESULTADOS.map((r) => [r.valor, r.rotulo])
) as Record<ProspectResultado, string>;

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

/**
 * O que vender para este lead, derivado da presença digital.
 *
 * Quem não tem site precisa de site E de agenda; quem já tem site só precisa da
 * agenda. É a mesma leitura que você faria no olho, escrita uma vez só.
 */
export function ofertaDe(l: LeadView): string {
  switch (presencaDe(l)) {
    case "Sem site": return "Site + agenda no WhatsApp";
    case "Só rede social": return "Site próprio + agenda no WhatsApp";
    case "Site próprio": return "Agenda automática no WhatsApp";
  }
}

export const formatarData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

/* ─────────────────────────────── Ordenação ────────────────────────────────── */

export type Ordem = "urgencia" | "alfabetica" | "score";

export const ROTULO_ORDEM: Record<Ordem, string> = {
  urgencia: "Urgência",
  alfabetica: "A → Z",
  score: "Score",
};

/**
 * Peso da urgência: quanto MENOR, mais em cima.
 *
 * A ordem responde "quem eu ligo agora": compromisso vencido primeiro, depois o
 * de hoje, depois o agendado para frente. Lead sem próxima ação vem antes dos
 * que já têm data marcada para daqui a semanas — ele está parado e ninguém
 * decidiu o que fazer com ele. Encerrado desce para o fim: não é trabalho.
 */
function pesoUrgencia(l: LeadView): number {
  if (ENCERRADOS.includes(l.stage)) return 5;
  const d = diasAte(l.proximaAcaoEm);
  if (d !== null && d < 0) return 0; // atrasado
  if (d === 0) return 1; // hoje
  if (l.stage === "NOVO") return 3; // nunca tocado
  if (d === null) return 2; // largado: ativo e sem plano
  return 4; // agendado para frente
}

export function ordenar(leads: LeadView[], ordem: Ordem): LeadView[] {
  const porNome = (a: LeadView, b: LeadView) => a.nome.localeCompare(b.nome, "pt-BR");
  const copia = [...leads];

  if (ordem === "alfabetica") return copia.sort(porNome);
  if (ordem === "score") return copia.sort((a, b) => b.score - a.score || porNome(a, b));

  return copia.sort((a, b) => {
    const peso = pesoUrgencia(a) - pesoUrgencia(b);
    if (peso !== 0) return peso;
    // Dentro do mesmo peso, o mais vencido primeiro; sem data, o de maior score.
    const da = diasAte(a.proximaAcaoEm);
    const db = diasAte(b.proximaAcaoEm);
    if (da !== null && db !== null && da !== db) return da - db;
    return b.score - a.score || porNome(a, b);
  });
}
