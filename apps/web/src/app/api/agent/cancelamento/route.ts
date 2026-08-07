import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services, schemas, ZodError } from "@barbearia-ai/core";
import { APPOINTMENT_STATUS, label } from "@/lib/labels";

const SP_DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Ferramenta pro agente de IA (n8n): o cliente pede para DESMARCAR pelo WhatsApp.
 *
 * Esta rota NÃO cancela nada — de propósito. Cancelar pode mexer em pagamento já
 * registrado e política de devolução; é decisão de gente. O que ela faz é garantir que o pedido
 * não morra na conversa: escala pra equipe (pausa o bot), grava o contexto e
 * notifica. Antes disto, quem pedisse cancelamento pelo WhatsApp era só escalado
 * genericamente e a data continuava ocupada na agenda até alguém perceber.
 *
 * Devolve os agendamentos ativos do telefone para a IA confirmar QUAL é sem inventar.
 * Tenant vem do host. Protegido pelo segredo deste tenant.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  let input;
  try {
    input = schemas.agentCancelRequestInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    }
    throw e;
  }

  // Os agendamentos de verdade desse telefone — a IA não deve supor qual é.
  const appointments = await services.appointmentService.upcomingForPhone(tenant.id, input.phone);
  const ativos = appointments.map((appointment) => ({
    appointmentId: appointment.id,
    date: appointment.startAt.toISOString().slice(0, 10),
    dateLabel: SP_DATE.format(appointment.startAt),
    status: label(APPOINTMENT_STATUS, appointment.status),
    professionalName: appointment.professional?.name ?? null,
    services: appointment.services.map((item) => item.serviceNameSnapshot),
    total: Number(appointment.total),
  }));

  // Nenhum atendimento marcado: não há o que desmarcar. Continua escalando, porque
  // pode estar em outro telefone — mas sem prometer cancelamento.
  const alvo = input.date ? ativos.find((appointment) => appointment.date === input.date) : ativos[0];

  const detalhe = alvo
    ? `atendimento de ${alvo.dateLabel} (${alvo.services.join(", ") || "sem serviço"})`
    : ativos.length
      ? `não identificou qual dos ${ativos.length} agendamentos`
      : "nenhum agendamento ativo encontrado nesse telefone";
  const motivo = `Pediu para CANCELAR — ${detalhe}${input.reason ? `. Motivo: ${input.reason}` : ""}`;

  // Mesma mecânica do /suporte: pausa o bot para a equipe assumir a conversa.
  await services.conversationService.takeOverByPhone(tenant.id, input.phone);
  await services.notificationService.create(tenant.id, {
    type: "APPOINTMENT_CANCEL_REQUESTED",
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
    agendamentosAtivos: ativos,
    message:
      "Pedido de cancelamento anotado e a equipe já foi avisada. NÃO diga que o agendamento foi cancelado — diga que a equipe vai retornar para confirmar os detalhes.",
  });
}
