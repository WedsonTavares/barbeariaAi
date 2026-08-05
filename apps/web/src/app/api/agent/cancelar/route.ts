import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@barbearia-ai/core";
import { avisarEquipe } from "@/lib/aviso-interno";

/**
 * Cancela de verdade um agendamento identificado por /api/agent/meus-agendamentos.
 * Mantém todo o histórico e não altera CRM, tags, notas ou dados financeiros.
 */
export async function POST(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || req.headers.get("x-barbearia-ai-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  let input;
  try {
    input = schemas.agentAppointmentCancelInput.parse(await req.json());
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
    const result = await services.appointmentService.cancelFromAgent(tenant.id, input);

    // Cancelou de verdade agora: a equipe precisa saber na hora, senão só
    // descobre abrindo o painel. Cancelamento repetido não reavisa.
    if (!result.alreadyCanceled) {
      await avisarEquipe(
        tenant,
        ["Agendamento CANCELADO pelo cliente (via IA)", `Telefone: ${input.phone}`].join("\n")
      ).catch(() => {});
      await services.calendarService.syncAppointment(tenant.id, result.appointmentId).catch((error) => {
        console.error("[google-calendar] sync ao cancelar falhou", error);
      });
    }

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
    if (error instanceof services.AppointmentAgentError) {
      return NextResponse.json(
        { ok: false, reason: "nao_encontrado", message: error.message },
        { status: 404 }
      );
    }
    // Antes de AppointmentStateError: AppointmentPaymentError estende ele e precisa de
    // um motivo próprio pro n8n cair no fluxo humano (/api/agent/cancelamento).
    if (error instanceof services.AppointmentPaymentError) {
      return NextResponse.json(
        { ok: false, canceled: false, reason: "financeiro", message: error.message },
        { status: 409 }
      );
    }
    if (error instanceof services.AppointmentStateError) {
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
