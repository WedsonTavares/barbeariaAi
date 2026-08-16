import { assinar } from "./assinatura.js";

/**
 * As ferramentas que o Hermes pode usar — allowlist fechada.
 *
 * Não existe `execute_sql`, `http_request` nem nada genérico: o Hermes não
 * escolhe URL, não monta consulta e não conhece o banco. Ele escolhe um NOME
 * desta lista, e quem traduz nome em consulta é o app, do outro lado, com os
 * services e a RLS que já existem.
 *
 * Uma ferramenta nova aqui é uma decisão explícita, revisável em diff. É o que
 * separa "o agente consulta o CRM" de "o agente tem o banco na mão".
 */
export const FERRAMENTAS = {
  "prospeccao.resumo": "Números gerais da carteira: total, por etapa, conversão, atrasados.",
  "prospeccao.leads_prioritarios":
    "Os melhores leads para abordar agora, com score, presença digital e por que entraram.",
  "prospeccao.funil": "Contagem por etapa do funil e a taxa entre etapas consecutivas.",
  "prospeccao.motivos_de_perda": "Por que os leads foram perdidos, agrupado por motivo.",
  "prospeccao.esquecidos":
    "Leads ativos sem próxima ação marcada, ou com follow-up vencido. Os que somem do processo.",
  "lojas.resumo": "Lojas da plataforma: quantas ativas, assinatura, WhatsApp conectado.",
} as const;

export type NomeFerramenta = keyof typeof FERRAMENTAS;

export const ehFerramentaValida = (n: string): n is NomeFerramenta => n in FERRAMENTAS;

/**
 * Chama uma ferramenta no app.
 *
 * O Hermes não tem credencial do Supabase, do Clerk nem da VPS — só o segredo
 * compartilhado com o Next. Tudo que ele consegue ler é o que estas rotas
 * devolvem, e elas são somente leitura.
 */
export async function chamarFerramenta(
  nome: NomeFerramenta,
  argumentos: Record<string, unknown>,
  ctx: { apiBase: string; segredo: string; requestId: string }
): Promise<unknown> {
  const corpo = JSON.stringify({ tool: nome, args: argumentos });
  const ts = String(Date.now());

  const res = await fetch(`${ctx.apiBase}/api/hermes/ferramentas`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hermes-timestamp": ts,
      "x-hermes-assinatura": assinar(ctx.segredo, ts, corpo),
      "x-request-id": ctx.requestId,
    },
    body: corpo,
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`ferramenta ${nome} respondeu ${res.status}: ${texto.slice(0, 200)}`);
  }
  return res.json();
}
