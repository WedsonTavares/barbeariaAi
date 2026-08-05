"use server";
import { revalidatePath } from "next/cache";
import { requireRole, services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { sendText } from "@/lib/evolution";
import { normalizeTag } from "@/lib/tags";
import { sendPosAtendimentoAutoMessage } from "@/lib/pos-atendimento";

/**
 * Abre a conversa selecionada (thread + contexto). Zera o não-lido.
 *
 * Os agendamentos vêm do banco AGORA (`upcomingForPhone`), não do resumo escrito pela
 * IA: o resumo é um texto congelado no momento em que ela fechou algo e continua
 * afirmando "agendamento fechado" mesmo se ele foi cancelado ou apagado depois.
 * Quem manda sobre o que está marcado é a tabela de agendamentos.
 */
export async function loadConversationAction(id: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const c = await services.conversationService.get(tenant.id, id);
  if (!c) return null;

  const appointments = await services.appointmentService.upcomingForPhone(tenant.id, c.phone);

  return {
    id: c.id,
    phone: c.phone,
    contactName: c.contactName,
    tags: c.tags,
    botPaused: c.botPaused,
    stage: c.stage as string,
    notes: c.notes,
    notesAt: c.notesAt ? c.notesAt.toISOString() : null,
    summary: c.summary,
    summaryAt: c.summaryAt ? c.summaryAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      status: appointment.status as string,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      total: Number(appointment.total),
      professionalName: appointment.professional?.name ?? null,
      services: appointment.services.map((item) => item.serviceNameSnapshot),
    })),
    messages: c.messages.map((m) => ({
      id: m.id,
      sender: m.sender as string,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    })),
    // Há história antes desta página? A tela usa pra decidir se continua
    // carregando quando o atendente rola pra cima.
    temMaisAntigas: c.temMaisAntigas,
    totalMensagens: c.totalMensagens,
  };
}

/** Atendente responde: envia no WhatsApp e registra no inbox como 🧑 Equipe. */
export async function replyAction(id: string, phone: string, text: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const msg = text.trim();
  const to = phone.replace(/\D/g, "");
  if (!msg || !to) return { ok: false as const };

  const instance = await services.tenantService.evolutionInstance(tenant.id, tenant.slug);
  const sent = await sendText(instance, to, msg);
  if (sent) await services.conversationService.recordOutbound(tenant.id, to, msg, "AGENT");
  revalidatePath("/admin/conversas");
  return { ok: sent };
}

/**
 * Página anterior do histórico, para quando o atendente rola pra cima.
 *
 * Devolve só as mensagens — nada de agendamento, tag ou nota: rolar pra ver o
 * passado não deve custar as consultas de contexto nem marcar nada como lido.
 */
export async function mensagensAntigasAction(id: string, antesDeIso: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);

  const antesDe = new Date(antesDeIso);
  if (Number.isNaN(antesDe.getTime())) return { ok: false as const };

  const r = await services.conversationService.mensagensAntes(tenant.id, id, antesDe);
  return {
    ok: true as const,
    temMaisAntigas: r.temMaisAntigas,
    messages: r.messages.map((m) => ({
      id: m.id,
      sender: m.sender as string,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/**
 * Gera (ou refaz) o resumo da conversa inteira, sob demanda pelo botão.
 *
 * Não usa `revalidatePath`: quem chamou já recebe o texto de volta e atualiza
 * o painel na hora — recarregar a rota inteira aqui só faria a lista piscar.
 */
export async function summarizeConversationAction(id: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);

  const r = await services.summaryService.generate(tenant.id, id);
  if (!r.ok) return { ok: false as const, motivo: r.motivo };
  return { ok: true as const, summary: r.summary, summaryAt: r.summaryAt.toISOString() };
}

/** Liga/desliga UMA tag sem zerar não-lidas nem substituir as demais. */
export async function toggleTagAction(id: string, tag: string, on: boolean) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const t = normalizeTag(tag);
  if (!t) return { ok: false as const, tags: [] as string[] };

  const changed = await services.conversationService.toggleTag(tenant.id, id, t, on);

  // "pos-atendimento" tem o mesmo efeito de arrastar o card no Funil: dispara a
  // mesma mensagem automática, só na transição de verdade.
  if (t === "pos-atendimento" && on && changed.previousStage !== "POS_ATENDIMENTO") {
    await sendPosAtendimentoAutoMessage(tenant, changed.phone);
  }

  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  return { ok: true as const, tags: changed.tags };
}

/** Assumir (pausa a IA) / devolver pro bot. */
export async function toggleBotAction(id: string, pause: boolean) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  if (pause) await services.conversationService.takeOver(tenant.id, id);
  else await services.conversationService.releaseToBot(tenant.id, id);
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  return { ok: true as const };
}

/** Edita o nome exibido do contato no painel de detalhes. */
export async function updateContactAction(id: string, contactName: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  await services.conversationService.updateContact(tenant.id, id, { contactName });
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  return { ok: true as const };
}
