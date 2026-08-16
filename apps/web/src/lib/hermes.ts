import { randomUUID } from "node:crypto";

import { assinar } from "./hermes-assinatura";
import { flags } from "./flags";

/**
 * Gateway para o Hermes.
 *
 * Único ponto do app que fala com o serviço de inteligência. O navegador nunca
 * alcança o Hermes: a tela chama uma server action, a action chama isto, e isto
 * assina e sai. O endereço e o segredo ficam do lado de cá.
 *
 * FAIL-SAFE é a regra central: nada aqui pode derrubar uma função do CRM.
 * Qualquer falha — serviço fora, timeout, segredo errado — vira uma resposta
 * `{ ok: false }` com texto legível. Não relança, não propaga.
 */

export type RespostaHermes =
  | { ok: true; texto: string; ferramentasUsadas: string[]; requestId: string }
  | { ok: false; erro: string; indisponivel: boolean };

const INDISPONIVEL = "Serviço de inteligência temporariamente indisponível.";

export async function perguntarAoHermes(
  pergunta: string,
  perfil: "comercial" = "comercial"
): Promise<RespostaHermes> {
  if (!flags.hermes) {
    return { ok: false, erro: "A camada de inteligência está desligada.", indisponivel: true };
  }

  const base = process.env.HERMES_URL?.trim();
  const segredo = process.env.HERMES_SECRET?.trim();
  if (!base || !segredo) {
    console.error("[hermes] HERMES_URL ou HERMES_SECRET ausente.");
    return { ok: false, erro: INDISPONIVEL, indisponivel: true };
  }

  const requestId = randomUUID();
  const corpo = JSON.stringify({ pergunta, perfil });
  const ts = String(Date.now());

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/perguntar`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hermes-timestamp": ts,
        "x-hermes-assinatura": assinar(segredo, ts, corpo),
        "x-request-id": requestId,
      },
      body: corpo,
      // Teto acima do teto do Hermes: quem desiste primeiro é ele, e assim a
      // mensagem de erro que chega é a dele, mais específica que "timeout".
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });

    if (!res.ok) {
      const detalhe = await res.json().catch(() => ({}) as { erro?: string });
      console.error(`[hermes] ${requestId} respondeu ${res.status}`, detalhe);
      // 501 é perfil não implementado: erro de uso, vale mostrar como veio.
      if (res.status === 501 && detalhe.erro) {
        return { ok: false, erro: detalhe.erro, indisponivel: false };
      }
      if (res.status === 429) {
        return { ok: false, erro: "Muitas perguntas seguidas. Aguarde um instante.", indisponivel: false };
      }
      return { ok: false, erro: INDISPONIVEL, indisponivel: true };
    }

    const dados = (await res.json()) as {
      texto?: string;
      ferramentasUsadas?: string[];
      requestId?: string;
    };
    return {
      ok: true,
      texto: dados.texto ?? "",
      ferramentasUsadas: dados.ferramentasUsadas ?? [],
      requestId: dados.requestId ?? requestId,
    };
  } catch (e) {
    console.error(`[hermes] ${requestId} falhou`, e);
    return { ok: false, erro: INDISPONIVEL, indisponivel: true };
  }
}
