import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services, schemas, ZodError } from "@barbearia-ai/core";

/**
 * Ferramenta pro agente de IA: fecha o agendamento DE VERDADE no banco
 * (autoridade). A regra de conflito rejeita horário duplicado mesmo que a IA
 * tenha errado a disponibilidade. Nunca processa pagamento.
 * Tenant vem do host (subdomínio); o segredo conferido é o DESTE tenant.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  let input;
  try {
    input = schemas.agentAppointmentInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  try {
    const result = await services.appointmentService.createFromAgent(tenant.id, input);
    if (!result.alreadyExists) {
      await services.calendarService.syncAppointment(tenant.id, result.appointmentId).catch((error) => {
        console.error("[google-calendar] sync ao agendar falhou", error);
      });
    }
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.alreadyExists
        ? `Esse agendamento já estava confirmado para ${result.customerName} — ${result.services.join(", ")}.`
        : `Agendamento confirmado para ${result.customerName} — ${result.services.join(", ")}.`,
      calendar: result.alreadyExists
        ? null
        : {
            title: `${result.services.join(", ")} — ${result.customerName}`,
            start: result.startISO,
            end: result.endISO,
            description: `Agendamento criado pela IA. Total ${result.total}.`,
          },
    });
  } catch (e) {
    // Conflito e erro "amigável" viram mensagem que a IA repassa ao cliente (não é 500).
    if (e instanceof services.AppointmentConflictError) {
      return NextResponse.json({ ok: false, reason: "conflito", message: "Esse horário não está disponível. Quer ver outro horário, data ou profissional?" }, { status: 409 });
    }
    if (e instanceof services.AppointmentAgentError) {
      return NextResponse.json({ ok: false, reason: "dados", message: e.message }, { status: 422 });
    }
    console.error("[agent] erro ao agendar", e);
    return NextResponse.json({ ok: false, reason: "interno", message: "Não consegui fechar o agendamento agora — vou chamar alguém da equipe pra te ajudar." }, { status: 500 });
  }
}
