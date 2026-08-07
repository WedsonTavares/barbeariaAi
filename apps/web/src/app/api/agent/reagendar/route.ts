import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services, schemas, ZodError } from "@barbearia-ai/core";

/**
 * Reagenda um atendimento já identificado por /api/agent/meus-agendamentos.
 * Não altera preço, pagamento, cliente, CRM, tags ou notas.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  let input;
  try {
    input = schemas.agentAppointmentRescheduleInput.parse(await req.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, reason: "dados", error: "dados inválidos", details: error.issues },
        { status: 400 }
      );
    }
    throw error;
  }

  try {
    const result = await services.appointmentService.rescheduleFromAgent(tenant.id, input);
    if (!result.alreadyUpdated) {
      await services.calendarService.syncAppointment(tenant.id, result.appointmentId).catch((error) => {
        console.error("[google-calendar] sync ao reagendar falhou", error);
      });
    }
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.alreadyUpdated
        ? "O agendamento já estava nesse horário."
        : "Agendamento reagendado com sucesso.",
      calendar: result.alreadyUpdated
        ? null
        : {
            eventId: result.calendarEventId,
            start: result.startISO,
            end: result.endISO,
          },
    });
  } catch (error) {
    if (error instanceof services.AppointmentConflictError) {
      return NextResponse.json(
        {
          ok: false,
          reason: "conflito",
          message: "O novo horário não está mais disponível. Consulte os slots novamente.",
        },
        { status: 409 }
      );
    }
    if (error instanceof services.AppointmentAgentError) {
      return NextResponse.json(
        { ok: false, reason: "nao_encontrado", message: error.message },
        { status: 404 }
      );
    }
    if (error instanceof services.AppointmentStateError) {
      return NextResponse.json(
        { ok: false, reason: "estado", message: error.message },
        { status: 409 }
      );
    }
    console.error("[agent] erro ao reagendar", error);
    return NextResponse.json(
      { ok: false, reason: "interno", message: "Não consegui reagendar agora." },
      { status: 500 }
    );
  }
}
