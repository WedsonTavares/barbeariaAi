import { chamarFerramenta, ehFerramentaValida, type NomeFerramenta } from "./ferramentas.js";
import { ferramentasDoPerfil, type Perfil } from "./perfis.js";

/**
 * O laço do agente: pergunta → escolhe ferramentas → lê → responde.
 *
 * Fala com o OpenRouter, que expõe dezenas de modelos atrás do formato da
 * OpenAI. A vantagem prática: trocar de modelo é trocar `HERMES_MODEL`, sem
 * mexer no código nem redeployar.
 *
 * A chave é do Hermes e não sai daqui — o Next nunca a vê, e o Hermes nunca vê
 * a chave do Supabase. Cada um só tem o que precisa.
 */

/** Modelo capaz de usar ferramentas. Trocável por env sem tocar no código. */
const MODELO = process.env.HERMES_MODEL?.trim() || "anthropic/claude-3.5-sonnet";
const BASE = process.env.HERMES_MODEL_BASE?.trim() || "https://openrouter.ai/api/v1";
const MAX_VOLTAS = 6;

type ChamadaFerramenta = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type Mensagem =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChamadaFerramenta[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type Resposta = {
  texto: string;
  ferramentasUsadas: string[];
  requestId: string;
};

export async function responder(
  pergunta: string,
  perfil: Perfil,
  ctx: { apiBase: string; segredoFerramentas: string; chaveModelo: string; requestId: string }
): Promise<Resposta> {
  // O nome da ferramenta vai com `__` porque a API não aceita ponto. A tradução
  // de volta acontece antes de qualquer decisão de permissão.
  const tools = ferramentasDoPerfil(perfil).map((f) => ({
    type: "function" as const,
    function: {
      name: f.nome.replace(/\./g, "__"),
      description: f.descricao,
      parameters: {
        type: "object",
        properties: {
          limite: { type: "number", description: "Quantos itens no máximo (opcional)." },
        },
      },
    },
  }));

  const mensagens: Mensagem[] = [
    { role: "system", content: perfil.instrucoes },
    { role: "user", content: pergunta },
  ];
  const usadas: string[] = [];

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ctx.chaveModelo}`,
        // O OpenRouter usa estes dois para atribuição de uso. Não são segredo.
        // Só ASCII: header HTTP é ByteString, e um travessão aqui derruba a
        // requisição inteira antes de sair — foi o que aconteceu no primeiro
        // teste.
        "http-referer": ctx.apiBase,
        "x-title": "Barbearia AI - Hermes",
      },
      body: JSON.stringify({ model: MODELO, messages: mensagens, tools, max_tokens: 2000 }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      throw new Error(`modelo respondeu ${res.status}: ${corpo.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ChamadaFerramenta[] } }[];
      error?: { message?: string };
    };
    if (data.error) throw new Error(`modelo recusou: ${data.error.message ?? "erro desconhecido"}`);

    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("resposta do modelo veio vazia");

    const chamadas = msg.tool_calls ?? [];
    mensagens.push({ role: "assistant", content: msg.content ?? null, tool_calls: chamadas });

    if (!chamadas.length) {
      return {
        texto: (msg.content ?? "").trim(),
        ferramentasUsadas: usadas,
        requestId: ctx.requestId,
      };
    }

    const resultados = await Promise.all(
      chamadas.map(async (c): Promise<Mensagem> => {
        const nome = c.function.name.replace(/__/g, ".");

        // Dupla checagem: o nome tem que estar na allowlist global E na fatia
        // deste perfil. O modelo pode inventar nome — a lista decide, não ele.
        if (!ehFerramentaValida(nome) || !perfil.ferramentas.includes(nome as NomeFerramenta)) {
          return {
            role: "tool",
            tool_call_id: c.id,
            content: `Ferramenta "${nome}" não existe ou não é permitida para este perfil.`,
          };
        }

        let args: Record<string, unknown> = {};
        try {
          args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
        } catch {
          // Argumento malformado não derruba a volta: a ferramenta roda com o
          // padrão dela, que é o comportamento útil na prática.
        }

        usadas.push(nome);
        try {
          const dados = await chamarFerramenta(nome, args, {
            apiBase: ctx.apiBase,
            segredo: ctx.segredoFerramentas,
            requestId: ctx.requestId,
          });
          return {
            role: "tool",
            tool_call_id: c.id,
            content: JSON.stringify(dados).slice(0, 60_000),
          };
        } catch (e) {
          return {
            role: "tool",
            tool_call_id: c.id,
            content: `Falha ao ler: ${e instanceof Error ? e.message : "erro"}`,
          };
        }
      })
    );

    mensagens.push(...resultados);
  }

  // Estourou as voltas: devolve o que dá, sem travar a tela esperando.
  return {
    texto: "Não consegui concluir a análise no tempo esperado. Tente uma pergunta mais específica.",
    ferramentasUsadas: usadas,
    requestId: ctx.requestId,
  };
}
