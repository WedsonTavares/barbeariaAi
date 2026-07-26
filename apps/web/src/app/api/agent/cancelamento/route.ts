import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";
import { BOOKING_STATUS, label } from "@/lib/labels";

const SP_DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Ferramenta pro agente de IA (n8n): o cliente pede para DESMARCAR pelo WhatsApp.
 *
 * Esta rota NÃO cancela nada — de propósito. Cancelar mexe em sinal já pago e em
 * política de devolução; é decisão de gente. O que ela faz é garantir que o pedido
 * não morra na conversa: escala pra equipe (pausa o bot), grava o contexto e
 * notifica. Antes disto, quem pedisse cancelamento pelo WhatsApp era só escalado
 * genericamente e a data continuava ocupada na agenda até alguém perceber.
 *
 * Devolve as festas ativas do telefone para a IA confirmar QUAL é sem inventar.
 * Tenant vem do host. Protegido por AGENT_API_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || req.headers.get("x-diny-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  let input;
  try {
    input = schemas.agentCancelRequestInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    }
    throw e;
  }

  // As festas de verdade desse telefone — a IA não deve supor qual é.
  const bookings = await services.bookingService.upcomingForPhone(tenant.id, input.phone);
  const festas = bookings.map((b) => ({
    date: b.eventDate.toISOString().slice(0, 10),
    dateLabel: SP_DATE.format(b.eventDate),
    status: label(BOOKING_STATUS, b.status),
    toys: b.items.map((i) => i.toy.name),
    total: Number(b.total),
  }));

  // Nenhuma festa marcada: não há o que desmarcar. Continua escalando, porque
  // pode ser reserva feita por outro telefone — mas sem prometer cancelamento.
  const alvo = input.date ? festas.find((f) => f.date === input.date) : festas[0];

  const detalhe = alvo
    ? `festa de ${alvo.dateLabel} (${alvo.toys.join(", ") || "sem brinquedo"})`
    : festas.length
      ? `não identificou qual das ${festas.length} festas`
      : "nenhuma festa ativa encontrada nesse telefone";
  const motivo = `Pediu para CANCELAR — ${detalhe}${input.reason ? `. Motivo: ${input.reason}` : ""}`;

  // Mesma mecânica do /suporte: pausa o bot para a equipe assumir a conversa.
  await services.conversationService.takeOverByPhone(tenant.id, input.phone);
  await services.notificationService.create(tenant.id, {
    type: "BOOKING_CANCEL_REQUESTED",
    title: "Pedido de cancelamento",
    body: [`Telefone: ${input.phone.replace(/\D/g, "")}`, input.name, detalhe, input.reason]
      .filter(Boolean)
      .join(" · "),
  });
  // Grava o contexto sozinho — não depende da IA lembrar de chamar a tool "notas".
  await services.conversationService.setNote(tenant.id, input.phone, motivo);

  return NextResponse.json({
    ok: true,
    reason: "pedido_registrado",
    // Deixa explícito para a IA: pedido anotado ≠ cancelado.
    canceled: false,
    festasAtivas: festas,
    message:
      "Pedido de cancelamento anotado e a equipe já foi avisada. NÃO diga que a festa foi cancelada — diga que a equipe vai retornar para confirmar o cancelamento e tratar o sinal.",
  });
}
