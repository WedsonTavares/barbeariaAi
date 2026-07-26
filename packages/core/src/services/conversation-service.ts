import { withTenant, type Tx } from "../db/withTenant";
import type { MessageSender, ConversationStage } from "@prisma/client";

/** Tags que pausam o bot (a IA não responde quando o contato tem uma dessas). */
export const BOT_SILENCING_TAGS = ["desligar-ia", "atendimento-humano"];

/** Colunas do funil, na ordem em que aparecem no quadro. */
export const CONVERSATION_STAGES = [
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
  NOVO_LEAD: "novo-lead", // legado: mantido só pra limpar a tag antiga ao mover o card
  IA_ATENDENDO: null, // fluxo normal: sem tag (a IA responde)
  SUPORTE_HUMANO: "atendimento-humano",
  AGENDADO: "agendado",
  POS_FESTA: "pos-festa",
};

const ALL_STAGE_TAGS = Object.values(STAGE_TAG).filter((t): t is string => Boolean(t));

async function lockConversation(tx: Tx, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conversation-tag:${id}`}))`;
}

async function takeOverConversation(tx: Tx, id: string) {
  await lockConversation(tx, id);
  const conversation = await tx.conversation.findFirstOrThrow({ where: { id } });
  const kept = conversation.tags.filter((tag) => !ALL_STAGE_TAGS.includes(tag));
  const tags = [...new Set([...kept, "atendimento-humano"])];
  return tx.conversation.update({
    where: { id },
    data: { botPaused: true, tags, stage: "SUPORTE_HUMANO" },
  });
}

/**
 * Fecha o ciclo do atendimento quando uma reserva é criada pelo agente.
 * Recebe a transação da reserva para que booking + etapa + contexto sejam atômicos:
 * ou tudo é persistido, ou tudo sofre rollback.
 */
export async function markConversationScheduled(
  tx: Tx,
  tenantId: string,
  input: { phone: string; customerId: string; note: string; repairOnly?: boolean }
) {
  const found = await tx.conversation.findUnique({
    where: { tenantId_phone: { tenantId, phone: input.phone } },
    select: { id: true },
  });
  if (!found) return null;

  // Usa o mesmo lock de toggleTag para não perder uma tag marcada por outro
  // atendente enquanto a reserva muda o card de coluna.
  await lockConversation(tx, found.id);
  const conversation = await tx.conversation.findUnique({
    where: { tenantId_phone: { tenantId, phone: input.phone } },
  });
  if (!conversation) return null;
  // Retry de uma reserva antiga pode reparar cards que ainda ficaram no fluxo
  // da IA, mas nunca desfaz uma tomada humana nem regride um pós-festa.
  if (input.repairOnly && !["NOVO_LEAD", "IA_ATENDENDO"].includes(conversation.stage)) {
    return conversation;
  }

  const kept = conversation.tags.filter((tag) => !ALL_STAGE_TAGS.includes(tag));
  const tags = [...new Set([...kept, STAGE_TAG.AGENDADO!])];
  return tx.conversation.update({
    where: { id: conversation.id },
    data: {
      customerId: input.customerId,
      stage: "AGENDADO",
      tags,
      botPaused: tags.some((tag) => BOT_SILENCING_TAGS.includes(tag)),
      notes: input.note.slice(0, 2000),
      notesAt: new Date(),
    },
  });
}

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
    withTenant(tenantId, (tx) =>
      // Mensagem comum pertence ao Inbox: Message + Conversation.unread já
      // informam o atendente. O sino fica reservado para eventos acionáveis.
      recordMessage(tx, tenantId, { phone, text, sender: "CONTACT", contactName })
    ),

  /** Resposta enviada (pela IA ou por um atendente). */
  recordOutbound: (tenantId: string, phone: string, text: string, sender: "BOT" | "AGENT") =>
    withTenant(tenantId, async (tx) => {
      const convo = await recordMessage(tx, tenantId, { phone, text, sender });
      // Conversa antiga que ficou no estágio legado volta pro fluxo normal.
      if (convo.stage === "NOVO_LEAD") {
        await tx.conversation.update({ where: { id: convo.id }, data: { stage: "IA_ATENDENDO" } });
      }
      return convo;
    }),

  /** Atendente assume a conversa: pausa o bot, marca a tag e move o card. */
  takeOver: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) => takeOverConversation(tx, id)),

  /** Devolve a conversa pro bot: religa, tira a tag de humano e volta o card. */
  releaseToBot: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      await lockConversation(tx, id);
      const c = await tx.conversation.findFirstOrThrow({ where: { id } });
      let tags = c.tags.filter((t) => t !== "atendimento-humano");
      let stage = c.stage;
      if (c.stage === "SUPORTE_HUMANO") {
        tags = tags.filter((tag) => !ALL_STAGE_TAGS.includes(tag));
        stage = "IA_ATENDENDO";
      }
      return tx.conversation.update({
        where: { id },
        data: {
          botPaused: tags.some((tag) => BOT_SILENCING_TAGS.includes(tag)),
          tags,
          stage,
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
    withTenant(tenantId, async (tx) => {
      await lockConversation(tx, id);
      return tx.conversation.update({
        where: { id },
        data: { tags, botPaused: tags.some((t) => BOT_SILENCING_TAGS.includes(t)) },
      });
    }),

  /**
   * Liga/desliga uma única tag sem substituir a lista inteira. O lock serializa
   * mudanças simultâneas no mesmo contato. "atendimento-humano" também move o
   * card, mantendo a tag, a coluna e o estado da IA sincronizados.
   */
  toggleTag: (tenantId: string, id: string, tag: string, on: boolean) =>
    withTenant(tenantId, async (tx) => {
      await lockConversation(tx, id);
      const c = await tx.conversation.findFirstOrThrow({ where: { id } });

      let stage = c.stage;
      let tags: string[];

      if (tag === "atendimento-humano") {
        if (on) {
          const kept = c.tags.filter((t) => !ALL_STAGE_TAGS.includes(t));
          tags = [...new Set([...kept, tag])];
          stage = "SUPORTE_HUMANO";
        } else {
          tags = c.tags.filter((t) => t !== tag);
          if (c.stage === "SUPORTE_HUMANO") {
            tags = tags.filter((t) => !ALL_STAGE_TAGS.includes(t));
            stage = "IA_ATENDENDO";
          }
        }
      } else {
        tags = on
          ? [...new Set([...c.tags, tag])].slice(0, 20)
          : c.tags.filter((t) => t !== tag);
      }

      const botPaused = tags.some((t) => BOT_SILENCING_TAGS.includes(t));
      return tx.conversation.update({
        where: { id },
        data: { tags, stage, botPaused },
        select: { id: true, tags: true, stage: true, botPaused: true },
      });
    }),

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

  /**
   * Quadro do funil. A coluna AGENDADO é derivada da reserva ativa, não apenas
   * do stage persistido: isso cobre reservas antigas/manuais, cancelamento e a
   * passagem natural do horário sem precisar escrever no banco durante a leitura.
   * O estado da IA continua independente em botPaused.
   */
  board: (tenantId: string, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const rows = await tx.conversation.findMany({
        orderBy: { lastMessageAt: "desc" },
        take: 300,
        select: {
          id: true, phone: true, contactName: true, customerId: true, tags: true,
          botPaused: true, unread: true, lastMessageAt: true, stage: true, notes: true,
        },
      });
      const phones = [...new Set(rows.map((row) => row.phone))];
      const customerIds = [...new Set(rows.map((row) => row.customerId).filter((id): id is string => Boolean(id)))];
      const activeBookings = rows.length
        ? await tx.booking.findMany({
            where: {
              status: { in: ["CONFIRMED", "IN_DELIVERY", "MOUNTED"] },
              pickupTime: { gte: now },
              OR: [
                ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
                { customer: { phone: { in: phones } } },
              ],
            },
            orderBy: [{ setupTime: "asc" }, { eventDate: "asc" }, { id: "asc" }],
            select: {
              customerId: true,
              eventDate: true,
              setupTime: true,
              customer: { select: { phone: true } },
            },
          })
        : [];
      const activeBookingByCustomer = new Map<string, Date>();
      const activeBookingByPhone = new Map<string, Date>();
      for (const booking of activeBookings) {
        const at = booking.setupTime ?? booking.eventDate;
        if (!activeBookingByCustomer.has(booking.customerId)) {
          activeBookingByCustomer.set(booking.customerId, at);
        }
        const phone = booking.customer.phone.replace(/\D/g, "");
        if (!activeBookingByPhone.has(phone)) {
          activeBookingByPhone.set(phone, at);
        }
      }
      const cards = rows.map(({ customerId, ...row }) => {
        const phone = row.phone.replace(/\D/g, "");
        const activeBookingAt =
          (customerId ? activeBookingByCustomer.get(customerId) : undefined) ??
          activeBookingByPhone.get(phone) ??
          null;
        const stage: ConversationStage = activeBookingAt
          ? "AGENDADO"
          : row.stage === "AGENDADO"
            ? (row.tags.includes("atendimento-humano") ? "SUPORTE_HUMANO" : "IA_ATENDENDO")
            : row.stage;
        return {
          ...row,
          stage,
          activeBookingAt,
        };
      });
      const byStage = Object.fromEntries(
        CONVERSATION_STAGES.map((s) => [s, [] as typeof cards])
      ) as Record<ConversationStage, typeof cards>;
      for (const card of cards) (byStage[card.stage] ??= []).push(card);
      return byStage;
    }),

  /**
   * Move o card de coluna. Além do `stage`, sincroniza as tags e o bot:
   * SUPORTE_HUMANO pausa a IA (tag atendimento-humano); sair de lá religa.
   * Preserva as tags livres do usuário (só troca as tags de etapa).
   */
  setStage: (tenantId: string, id: string, stage: ConversationStage) =>
    withTenant(tenantId, async (tx) => {
      await lockConversation(tx, id);
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
      await takeOverConversation(tx, c.id);
    }),
};
