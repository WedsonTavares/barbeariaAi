import type { WhatsappState } from "@/lib/evolution";

/**
 * A loja como a tela do super admin precisa dela: já achatada e serializável,
 * para atravessar a fronteira server → client component. Nada de `Decimal` nem
 * `Date` aqui — os dois quebram a serialização do React Server Components.
 */
export type LojaView = {
  id: string;
  nome: string;
  slug: string;
  clerkOrgId: string;
  ativa: boolean;
  criadaEm: string;
  instance: string;
  /** `null` = o Evolution não respondeu. Diferente de "desconectado". */
  whatsapp: WhatsappState | null;
  plan: string | null;
  monthlyFee: number | null;
  paidUntil: string | null;
  lastPaymentAt: string | null;
  links: { label: string; url: string }[];
  adminNotes: string | null;
  /** Ids das etapas manuais já marcadas (ver ETAPAS_MANUAIS). */
  setupSteps: string[];
};

/**
 * Etapas da implantação que NÃO dá para deduzir sozinho — só existem porque
 * alguém fez o trabalho fora do sistema. As dedutíveis ("loja criada",
 * "WhatsApp conectado") ficam de fora de propósito: guardar um `done` para elas
 * criaria um segundo estado, que uma hora mente.
 */
export const ETAPAS_MANUAIS = [
  { id: "negocio", rotulo: "Serviços e horários cadastrados" },
  { id: "workflow", rotulo: "Workflow criado e ativo no n8n" },
  { id: "teste", rotulo: "Isolamento testado com outra loja" },
] as const;

export type EstadoAssinatura = "sem-cobranca" | "em-dia" | "vence-em-breve" | "vencida";

/**
 * Traduz `paidUntil` no que interessa na tela: venceu, está para vencer, ou
 * está em dia. "Em breve" são 7 dias — tempo de cobrar antes de precisar
 * suspender.
 *
 * Compara por DIA, não por instante: uma assinatura que vence hoje está em dia
 * o dia inteiro, não a partir do horário em que foi paga no mês passado.
 */
export function statusAssinatura(
  paidUntil: string | null,
  hoje = new Date()
): { estado: EstadoAssinatura; dias: number | null; rotulo: string } {
  if (!paidUntil) return { estado: "sem-cobranca", dias: null, rotulo: "Sem cobrança" };

  const diaDe = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dias = Math.round((diaDe(new Date(paidUntil)) - diaDe(hoje)) / 86_400_000);

  if (dias < 0) return { estado: "vencida", dias, rotulo: `Vencida há ${Math.abs(dias)}d` };
  if (dias === 0) return { estado: "vence-em-breve", dias, rotulo: "Vence hoje" };
  if (dias <= 7) return { estado: "vence-em-breve", dias, rotulo: `Vence em ${dias}d` };
  return { estado: "em-dia", dias, rotulo: `Em dia · ${dias}d` };
}

/** Texto e cor do estado do WhatsApp, na linguagem de quem administra. */
export function rotuloWhatsapp(estado: WhatsappState | null): { texto: string; classe: string } {
  switch (estado) {
    case "open":
      return { texto: "Conectado", classe: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "connecting":
      return { texto: "Aguardando QR", classe: "bg-amber-50 text-amber-700 border-amber-200" };
    case "close":
      return { texto: "Desconectado", classe: "bg-red-50 text-red-700 border-red-200" };
    default:
      // `null` (Evolution fora) e "unknown" caem aqui: não sabemos, e dizer
      // "desconectado" seria mentira que gera correria à toa.
      return { texto: "Sem informação", classe: "bg-slate-50 text-slate-600 border-slate-200" };
  }
}
