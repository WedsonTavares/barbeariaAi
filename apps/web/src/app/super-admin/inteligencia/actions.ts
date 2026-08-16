"use server";

import { requireSuperAdmin } from "@barbearia-ai/core";
import { getAuthContext } from "@/lib/tenant";
import { perguntarAoHermes, type RespostaHermes } from "@/lib/hermes";

/**
 * Pergunta à inteligência.
 *
 * O super admin é verificado AQUI, no servidor. O Hermes não conhece usuário,
 * sessão nem loja — ele responde a quem tem o segredo, e quem guarda o segredo
 * é esta camada. Toda a autorização acontece antes de sair daqui.
 */
export async function perguntarAction(pergunta: string): Promise<RespostaHermes> {
  requireSuperAdmin(await getAuthContext());

  const texto = pergunta.trim();
  if (!texto) return { ok: false, erro: "Escreva uma pergunta.", indisponivel: false };
  if (texto.length > 4000) {
    return { ok: false, erro: "Pergunta longa demais.", indisponivel: false };
  }

  return perguntarAoHermes(texto);
}
