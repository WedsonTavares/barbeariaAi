import { chamarFerramenta, ehFerramentaValida, type NomeFerramenta } from "./ferramentas.js";
import { ferramentasDoPerfil, type Perfil } from "./perfis.js";

/**
 * O laço do agente: pergunta → escolhe ferramentas → lê → responde.
 *
 * Fala com a API da Anthropic. A chave é do Hermes e não sai daqui — o Next
 * nunca a vê, e o Hermes nunca vê a chave do Supabase. Cada um só tem o que
 * precisa.
 */

const MODELO = process.env.HERMES_MODEL?.trim() || "claude-sonnet-5";
const MAX_VOLTAS = 6;

type Bloco =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export type Resposta = {
  texto: string;
  ferramentasUsadas: string[];
  requestId: string;
};

export async function responder(
  pergunta: string,
  perfil: Perfil,
  ctx: { apiBase: string; segredoFerramentas: string; chaveAnthropic: string; requestId: string }
): Promise<Resposta> {
  const catalogo = ferramentasDoPerfil(perfil);

  const tools = catalogo.map((f) => ({
    name: f.nome.replace(/\./g, "__"), // a API não aceita ponto no nome
    description: f.descricao,
    input_schema: {
      type: "object" as const,
      properties: {
        limite: { type: "number", description: "Quantos itens no máximo (opcional)." },
      },
    },
  }));

  const mensagens: { role: "user" | "assistant"; content: unknown }[] = [
    { role: "user", content: pergunta },
  ];
  const usadas: string[] = [];

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ctx.chaveAnthropic,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 2000,
        system: perfil.instrucoes,
        tools,
        messages: mensagens,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      throw new Error(`modelo respondeu ${res.status}: ${corpo.slice(0, 200)}`);
    }

    const data = (await res.json()) as { content: Bloco[]; stop_reason: string };
    mensagens.push({ role: "assistant", content: data.content });

    const chamadas = data.content.filter((b): b is Extract<Bloco, { type: "tool_use" }> =>
      b.type === "tool_use"
    );

    if (!chamadas.length) {
      const texto = data.content
        .filter((b): b is Extract<Bloco, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { texto, ferramentasUsadas: usadas, requestId: ctx.requestId };
    }

    const resultados = await Promise.all(
      chamadas.map(async (c) => {
        const nome = c.name.replace(/__/g, ".");

        // Dupla checagem: o nome tem que estar na allowlist global E na fatia
        // deste perfil. O modelo pode inventar nome — a lista decide, não ele.
        if (!ehFerramentaValida(nome) || !perfil.ferramentas.includes(nome as NomeFerramenta)) {
          return {
            type: "tool_result" as const,
            tool_use_id: c.id,
            content: `Ferramenta "${nome}" não existe ou não é permitida para este perfil.`,
            is_error: true,
          };
        }

        usadas.push(nome);
        try {
          const dados = await chamarFerramenta(nome, c.input ?? {}, {
            apiBase: ctx.apiBase,
            segredo: ctx.segredoFerramentas,
            requestId: ctx.requestId,
          });
          return {
            type: "tool_result" as const,
            tool_use_id: c.id,
            content: JSON.stringify(dados).slice(0, 60_000),
          };
        } catch (e) {
          return {
            type: "tool_result" as const,
            tool_use_id: c.id,
            content: e instanceof Error ? e.message : "falha ao ler",
            is_error: true,
          };
        }
      })
    );

    mensagens.push({ role: "user", content: resultados });
  }

  // Estourou as voltas: devolve o que dá, sem travar a tela esperando.
  return {
    texto: "Não consegui concluir a análise no tempo esperado. Tente uma pergunta mais específica.",
    ferramentasUsadas: usadas,
    requestId: ctx.requestId,
  };
}
