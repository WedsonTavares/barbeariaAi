import { withTenant, type Tx } from "../db/withTenant";
import { pushNotification } from "./notification-service";
import type { MessageSender, ConversationStage } from "@prisma/client";

/** Tags que pausam o bot (a IA não responde quando o contato tem uma dessas). */
export const BOT_SILENCING_TAGS = ["desligar-ia", "atendimento-humano"];

/** Colunas do funil, na ordem em que aparecem no quadro. */
export const CONVERSATION_STAGES = [
  "NOVO_LEAD",
  "IA_ATENDENDO",
  "SUPORTE_HUMANO",
  "AGENDADO",
  "POS_FESTA",
] as const satisfies readonly ConversationStage[];

/**
 * Tag que cada etapa carrega. Arrastar o card sincroniza a tag — é assim que o
 * funil e o n8n falam a mesma língua: SUPORTE_HUMANO usa a MESMA tag que já
 * pausa o bot hoje, então mover pra essa coluna silencia a IA automaticamente.
 */
export const STAGE_TAG: Record<ConversationStage, string | null> = {
  NOVO_LEAD: "novo-lead",
  IA_ATENDENDO: null, // fluxo normal: sem tag (a IA responde)
  SUPORTE_HUMANO: "atendimento-humano",
  AGENDADO: "agendado",
  POS_FESTA: "pos-festa",
};

const ALL_STAGE_TAGS = Object.values(STAGE_TAG).filter((t): t is string => Boolean(t));

/** Registra uma mensagem numa conversa (cria a conversa se for a primeira do telefone). */
export async function recordMessage(
  tx: Tx,
  tenantId: string,
  input: { phone: string; text: string; sender: MessageSender; contactName?: string }
) {
  const now = new Date();
  // Dedup: mesma mensagem (remetente + texto) nos últimos 8s → ignora
  // (clique duplo no "Enviar" ou webhook repetido do Evolution).
  const existing = await tx.conversation.findUnique({ where: { tenantId_phone: { tenantId, phone: input.phone } } });
  if (existing) {
    const dup = await tx.message.findFirst({
      where: { conversationId: existing.id, sender: input.sender, text: input.text, createdAt: { gte: new Date(now.getTime() - 8000) } },
    });
    if (dup) return existing;
  }
  const convo = await tx.conversation.upsert({
    where: { tenantId_phone: { tenantId, phone: input.phone } },
    create: {
      tenantId,
      phone: input.phone,
      contactName: input.contactName,
      lastMessageAt: now,
      unread: input.sender === "CONTACT" ? 1 : 0,
    },
    update: {
      lastMessageAt: now,
      ...(input.contactName ? { contactName: input.contactName } : {}),
      ...(input.sender === "CONTACT" ? { unread: { increment: 1 } } : {}),
    },
  });
  await tx.message.create({
    data: { tenantId, conversationId: convo.id, sender: input.sender, text: input.text },
  });
  return convo;
}

export const conversationService = {
  /** Lista de conversas (mais recentes primeiro) pro inbox. */
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.conversation.findMany({ orderBy: { lastMessageAt: "desc" }, take: 100 })
    ),

  /** Uma conversa + suas mensagens (ordem cronológica). Zera o não-lido. */
  get: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const convo = await tx.conversation.findFirst({ where: { id } });
      if (!convo) return null;
      const messages = await tx.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
        take: 500,
      });
      if (convo.unread > 0) await tx.conversation.update({ where: { id }, data: { unread: 0 } });
      return { ...convo, unread: 0, messages };
    }),

  /** Mensagem recebida do cliente (via webhook do WhatsApp). */
  recordInbound: (tenantId: string, phone: string, text: string, contactName?: string) =>
    withTenant(tenantId, async (tx) => {
      const convo = await recordMessage(tx, tenantId, { phone, text, sender: "CONTACT", contactName });
      await pushNotification(tx, tenantId, {
        type: "NEW_WHATSAPP_MESSAGE",
        title: "Nova mensagem no WhatsApp",
        body: `${contactName || phone}: ${text.slice(0, 80)}`,
      });
      return convo;
    }),

  /** Resposta enviada (pela IA ou por um atendente). */
  recordOutbound: (tenantId: string, phone: string, text: string, sender: "BOT" | "AGENT") =>
    withTenant(tenantId, async (tx) => {
      const convo = await recordMessage(tx, tenantId, { phone, text, sender });
      // O funil acompanha a realidade: assim que a IA responde, o card sai de
      // "Novo lead" e vai pra "IA atendendo". Só isso — não mexe nas outras etapas.
      if (sender === "BOT" && convo.stage === "NOVO_LEAD") {
        await tx.conversation.update({ where: { id: convo.id }, data: { stage: "IA_ATENDENDO" } });
      }
      return convo;
    }),

  /** Atendente assume a conversa: pausa o bot, marca a tag e move o card. */
  takeOver: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) =>
      tx.conversation.update({
        where: { id },
        data: { botPaused: true, tags: { push: "atendimento-humano" }, stage: "SUPORTE_HUMANO" },
      })
    ),

  /** Devolve a conversa pro bot: religa, tira a tag de humano e volta o card. */
  releaseToBot: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const c = await tx.conversation.findFirstOrThrow({ where: { id } });
      return tx.conversation.update({
        where: { id },
        data: {
          botPaused: false,
          tags: c.tags.filter((t) => t !== "atendimento-humano"),
          ...(c.stage === "SUPORTE_HUMANO" ? { stage: "IA_ATENDENDO" as const } : {}),
        },
      });
    }),

  /** Edita os dados do contato direto do painel (nome exibido na conversa/funil). */
  updateContact: (tenantId: string, id: string, data: { contactName?: string | null }) =>
    withTenant(tenantId, (tx) =>
      tx.conversation.update({
        where: { id },
        data: { contactName: data.contactName?.trim() || null },
      })
    ),

  /** Define as tags do contato (substitui a lista). */
  setTags: (tenantId: string, id: string, tags: string[]) =>
    withTenant(tenantId, (tx) =>
      tx.conversation.update({
        where: { id },
        data: { tags, botPaused: tags.some((t) => BOT_SILENCING_TAGS.includes(t)) },
      })
    ),

  /** O bot pode responder este telefone? (não, se pausado ou com tag silenciadora) */
  botCanReply: (tenantId: string, phone: string) =>
    withTenant(tenantId, async (tx) => {
      const c = await tx.conversation.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
      if (!c) return true; // conversa nova → bot pode
      if (c.botPaused) return false;
      return !c.tags.some((t) => BOT_SILENCING_TAGS.includes(t));
    }),

  /** Status do contato pro filtro inicial do n8n: se o bot pode falar + as tags. */
  status: (tenantId: string, phone: string) =>
    withTenant(tenantId, async (tx) => {
      const c = await tx.conversation.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
      const tags = c?.tags ?? [];
      const botPaused = c?.botPaused ?? false;
      const silenced = botPaused || tags.some((t) => BOT_SILENCING_TAGS.includes(t));
      return { canReply: !silenced, botPaused, tags, silencedBy: BOT_SILENCING_TAGS };
    }),

  /**
   * A IA grava o resumo do atendimento (tool "notas") pra equipe ter o contexto
   * sem ler a conversa toda. Guarda o resumo mais recente por telefone.
   */
  setNote: (tenantId: string, phone: string, note: string) =>
    withTenant(tenantId, async (tx) => {
      const c = await tx.conversation.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
      if (!c) return null;
      return tx.conversation.update({
        where: { id: c.id },
        data: { notes: note.slice(0, 2000), notesAt: new Date() },
      });
    }),

  /** Quadro do funil: as conversas agrupadas por etapa (colunas do Kanban). */
  board: (tenantId: string) =>
    withTenant(tenantId, async (tx) => {
      const rows = await tx.conversation.findMany({
        orderBy: { lastMessageAt: "desc" },
        take: 300,
        select: {
          id: true, phone: true, contactName: true, tags: true,
          botPaused: true, unread: true, lastMessageAt: true, stage: true, notes: true,
        },
      });
      const byStage = Object.fromEntries(
        CONVERSATION_STAGES.map((s) => [s, [] as typeof rows])
      ) as Record<ConversationStage, typeof rows>;
      for (const r of rows) (byStage[r.stage] ??= []).push(r);
      return byStage;
    }),

  /**
   * Move o card de coluna. Além do `stage`, sincroniza as tags e o bot:
   * SUPORTE_HUMANO pausa a IA (tag atendimento-humano); sair de lá religa.
   * Preserva as tags livres do usuário (só troca as tags de etapa).
   */
  setStage: (tenantId: string, id: string, stage: ConversationStage) =>
    withTenant(tenantId, async (tx) => {
      const c = await tx.conversation.findFirstOrThrow({ where: { id } });
      const kept = c.tags.filter((t) => !ALL_STAGE_TAGS.includes(t));
      const tag = STAGE_TAG[stage];
      const tags = tag ? [...kept, tag] : kept;
      return tx.conversation.update({
        where: { id },
        data: { stage, tags, botPaused: tags.some((t) => BOT_SILENCING_TAGS.includes(t)) },
      });
    }),

  /** Histórico recente pro contexto do bot (não zera não-lidas — quem lê é o atendente). */
  history: (tenantId: string, phone: string, limit = 20) =>
    withTenant(tenantId, async (tx) => {
      const c = await tx.conversation.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
      if (!c) return { contactName: null as string | null, messages: [] as { sender: string; text: string }[] };
      const rows = await tx.message.findMany({
        where: { conversationId: c.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { sender: true, text: true },
      });
      return { contactName: c.contactName, messages: rows.reverse() };
    }),

  /** Bot escala pra humano por telefone (pausa o bot + tag). */
  takeOverByPhone: (tenantId: string, phone: string) =>
    withTenant(tenantId, async (tx) => {
      const c = await tx.conversation.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
      if (!c) return;
      await tx.conversation.update({
        where: { id: c.id },
        data: {
          botPaused: true,
          tags: c.tags.includes("atendimento-humano") ? c.tags : { push: "atendimento-humano" },
          stage: "SUPORTE_HUMANO",
        },
      });
    }),
};
