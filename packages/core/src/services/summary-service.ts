import OpenAI from "openai";
import { withTenant } from "../db/withTenant";

/**
 * Resumo da conversa inteira, para quem assume um atendimento sem ter lido tudo.
 *
 * Fica separado do `notes`: aquele é a última nota de EVENTO escrita pela IA
 * (reserva, lead, escalonamento) e é sobrescrita a cada novo evento. Este é a
 * história da conversa do começo ao fim.
 *
 * Usa OpenAI porque é o que o resto do sistema já usa (o agente no n8n roda em
 * gpt-4o-mini com a mesma conta) — não vale trazer um segundo fornecedor só
 * para resumir. Sem `OPENAI_API_KEY` a função devolve `sem_chave` e ninguém
 * quebra: o botão avisa e o escalonamento segue normal.
 */

const MODEL = process.env.SUMMARY_MODEL || "gpt-4o-mini";

/**
 * Teto do que entra no prompt. Conversas de WhatsApp têm ~95 caracteres por
 * mensagem, então 500 mensagens dão ~12k tokens — centavos. O corte existe
 * para um contato patológico não virar uma conta inesperada.
 */
const MAX_MENSAGENS = 500;
const MAX_CHARS = 50_000;

const QUEM: Record<string, string> = { CONTACT: "Cliente", BOT: "IA", AGENT: "Equipe" };

const INSTRUCAO = `Você resume conversas de atendimento de uma empresa que aluga brinquedos para festas infantis.

Escreva em português do Brasil, no máximo 8 linhas, para um atendente que vai assumir a conversa AGORA e não leu nada.

Cubra, quando existir na conversa:
- o que o cliente quer (brinquedo, data, local, número de crianças)
- valores e condições que já foram combinados
- o que ficou pendente ou prometido
- o clima do contato (tranquilo, apressado, insatisfeito)

Regras:
- Só afirme o que está escrito na conversa. Não invente valor, data nem nome.
- Se algo importante ficou sem resposta, diga isso explicitamente.
- Sem saudação, sem despedida, sem "resumo:" no começo. Vá direto ao ponto.`;

export type SummaryResult =
  | { ok: true; summary: string; summaryAt: Date }
  | { ok: false; motivo: "sem_chave" | "sem_mensagens" | "falhou" };

let client: OpenAI | null | undefined;
function getClient(): OpenAI | null {
  // Mesmo padrão preguiçoso do bot-service: sem chave, o módulo continua
  // importável e o resto do sistema não sente.
  if (client === undefined) {
    client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  }
  return client;
}

export function summaryConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export const summaryService = {
  /**
   * Lê a conversa do começo, resume e grava. Devolve o motivo quando não deu,
   * em vez de lançar: quem chama (botão ou escalonamento) decide o que fazer,
   * e escalonamento NUNCA pode falhar por causa de um resumo.
   */
  generate: async (tenantId: string, conversationId: string): Promise<SummaryResult> => {
    const openai = getClient();
    if (!openai) return { ok: false, motivo: "sem_chave" };

    const rows = await withTenant(tenantId, (tx) =>
      tx.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: MAX_MENSAGENS,
        select: { sender: true, text: true, createdAt: true },
      })
    );
    if (rows.length === 0) return { ok: false, motivo: "sem_mensagens" };

    let transcript = rows
      .map((m) => `${QUEM[m.sender] ?? m.sender}: ${m.text}`)
      .join("\n");
    if (transcript.length > MAX_CHARS) {
      // Corta o MEIO e não o começo: o início diz o que o cliente queria e o
      // fim diz onde parou — as duas pontas são o que o atendente precisa.
      const metade = Math.floor(MAX_CHARS / 2);
      transcript =
        transcript.slice(0, metade) +
        "\n\n[...trecho do meio omitido por tamanho...]\n\n" +
        transcript.slice(-metade);
    }

    try {
      const res = await openai.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: INSTRUCAO },
          { role: "user", content: transcript },
        ],
      });
      const texto = res.choices[0]?.message?.content?.trim();
      if (!texto) return { ok: false, motivo: "falhou" };

      const summaryAt = new Date();
      await withTenant(tenantId, (tx) =>
        tx.conversation.updateMany({
          where: { id: conversationId },
          data: { summary: texto.slice(0, 4000), summaryAt },
        })
      );
      return { ok: true, summary: texto.slice(0, 4000), summaryAt };
    } catch (error) {
      console.error("[resumo] falhou ao gerar", error);
      return { ok: false, motivo: "falhou" };
    }
  },

  /**
   * Mesma coisa pelo telefone — é o que as rotas do agente têm em mãos
   * (mesmo padrão de `takeOverByPhone` e `setNote`).
   */
  generateByPhone: async (tenantId: string, phone: string): Promise<SummaryResult> => {
    const c = await withTenant(tenantId, (tx) =>
      tx.conversation.findUnique({
        where: { tenantId_phone: { tenantId, phone } },
        select: { id: true },
      })
    );
    if (!c) return { ok: false, motivo: "sem_mensagens" };
    return summaryService.generate(tenantId, c.id);
  },
};
