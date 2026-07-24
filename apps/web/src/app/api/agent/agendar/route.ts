import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/**
 * Ferramenta pro agente de IA (chamada pelo sub-workflow "Agenda" no n8n): fecha a
 * reserva DE VERDADE no nosso banco (autoridade). A regra de conflito rejeita reserva
 * dupla mesmo que a IA tenha errado a disponibilidade. Nunca processa pagamento.
 * O n8n usa a resposta pra espelhar o evento no Google Calendar.
 * Tenant vem do host (subdomínio). Sem AGENT_API_SECRET, toda chamada é rejeitada.
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
    input = schemas.agentBookingInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  try {
    const result = await services.bookingService.createFromAgent(tenant.id, input);
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Reserva confirmada para ${result.customerName} — ${result.toys.join(", ")}. Sinal a combinar com a equipe.`,
      // Pronto pro n8n criar o evento no Google Calendar:
      calendar: {
        title: `${result.toys.join(", ")} — ${result.customerName}`,
        start: result.setupISO,
        end: result.pickupISO,
        description: `Reserva Diny (agente IA). Total ${result.total}. Sinal pendente.`,
      },
    });
  } catch (e) {
    // Conflito e erro "amigável" viram mensagem que a IA repassa ao cliente (não é 500).
    if (e instanceof services.BookingConflictError) {
      return NextResponse.json({ ok: false, reason: "conflito", message: "Esse brinquedo já está reservado nesse dia. Quer ver outra data ou outro brinquedo?" }, { status: 409 });
    }
    if (e instanceof services.BookingAgentError) {
      return NextResponse.json({ ok: false, reason: "dados", message: e.message }, { status: 422 });
    }
    console.error("[agent] erro ao agendar", e);
    return NextResponse.json({ ok: false, reason: "interno", message: "Não consegui fechar a reserva agora — vou chamar alguém da equipe pra te ajudar." }, { status: 500 });
  }
}
