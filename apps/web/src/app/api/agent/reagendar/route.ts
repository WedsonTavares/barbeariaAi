import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/**
 * Reagenda uma reserva já identificada por /api/agent/meus-agendamentos.
 * Não altera preço, pagamento, brinquedos, cliente, CRM, tags ou notas.
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
    input = schemas.agentBookingRescheduleInput.parse(await req.json());
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
    const result = await services.bookingService.rescheduleFromAgent(tenant.id, input);
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
            start: result.setupISO,
            end: result.pickupISO,
          },
    });
  } catch (error) {
    if (error instanceof services.BookingConflictError) {
      return NextResponse.json(
        {
          ok: false,
          reason: "conflito",
          message: "O novo horário não está mais disponível. Consulte os slots novamente.",
        },
        { status: 409 }
      );
    }
    if (error instanceof services.BookingAgentError) {
      return NextResponse.json(
        { ok: false, reason: "nao_encontrado", message: error.message },
        { status: 404 }
      );
    }
    if (error instanceof services.BookingStateError) {
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
