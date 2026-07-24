import { withTenant, type Tx } from "../db/withTenant";
import { pushNotification } from "./notification-service";
import type { MessageSender } from "@prisma/client";

/** Tags que pausam o bot (a IA não responde quando o contato tem uma dessas). */
export const BOT_SILENCING_TAGS = ["desligar-ia", "atendimento-humano"];

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
    withTenant(tenantId, (tx) => recordMessage(tx, tenantId, { phone, text, sender })),

  /** Atendente assume a conversa: pausa o bot e marca a tag. */
  takeOver: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) =>
      tx.conversation.update({
        where: { id },
        data: { botPaused: true, tags: { push: "atendimento-humano" } },
      })
    ),

  /** Devolve a conversa pro bot: religa e tira a tag de humano. */
  releaseToBot: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const c = await tx.conversation.findFirstOrThrow({ where: { id } });
      return tx.conversation.update({
        where: { id },
        data: { botPaused: false, tags: c.tags.filter((t) => t !== "atendimento-humano") },
      });
    }),

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
        data: { botPaused: true, tags: c.tags.includes("atendimento-humano") ? c.tags : { push: "atendimento-humano" } },
      });
    }),
};
