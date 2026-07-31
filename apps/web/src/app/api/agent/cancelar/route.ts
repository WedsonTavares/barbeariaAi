import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/**
 * Cancela de verdade uma reserva identificada por /api/agent/meus-agendamentos.
 * Mantém todo o histórico e não altera CRM, tags, notas ou dados financeiros.
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
    input = schemas.agentBookingCancelInput.parse(await req.json());
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
    const result = await services.bookingService.cancelFromAgent(tenant.id, input);
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.alreadyCanceled
        ? "O agendamento já estava cancelado."
        : "Agendamento cancelado com sucesso.",
      calendar: result.alreadyCanceled
        ? null
        : {
            eventId: result.calendarEventId,
            action: "delete",
          },
    });
  } catch (error) {
    if (error instanceof services.BookingAgentError) {
      return NextResponse.json(
        { ok: false, reason: "nao_encontrado", message: error.message },
        { status: 404 }
      );
    }
    // Antes de BookingStateError: BookingPaymentError estende ele e precisa de
    // um motivo próprio pro n8n cair no fluxo humano (/api/agent/cancelamento).
    if (error instanceof services.BookingPaymentError) {
      return NextResponse.json(
        { ok: false, canceled: false, reason: "financeiro", message: error.message },
        { status: 409 }
      );
    }
    if (error instanceof services.BookingStateError) {
      return NextResponse.json(
        { ok: false, reason: "estado", message: error.message },
        { status: 409 }
      );
    }
    console.error("[agent] erro ao cancelar", error);
    return NextResponse.json(
      { ok: false, reason: "interno", message: "Não consegui cancelar agora." },
      { status: 500 }
    );
  }
}
