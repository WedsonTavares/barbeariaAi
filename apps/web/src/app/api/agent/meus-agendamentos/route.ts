import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, spClock, ZodError } from "@barbearia-ai/core";
import { APPOINTMENT_STATUS, label } from "@/lib/labels";

/** HH:mm no fuso do negócio — o ISO em UTC fazia a IA anunciar 3h a mais. */
function spTimeLabel(d: Date | null) {
  if (!d) return null;
  const { hour, minute } = spClock(d);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Ferramenta pro agente de IA (n8n): "quando é meu agendamento?".
 * Só leitura — devolve atendimentos ativos desse telefone.
 * Tenant vem do host. Protegido por AGENT_API_SECRET.
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
    input = schemas.agentLookupInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  const appointments = await services.appointmentService.upcomingForPhone(tenant.id, input.phone);

  return NextResponse.json({
    ok: true,
    count: appointments.length,
    appointments: appointments.map((appointment) => ({
      appointmentId: appointment.id,
      date: spClock(appointment.startAt).dayKey,
      start: appointment.startAt.toISOString(),
      end: appointment.endAt.toISOString(),
      startTimeLabel: spTimeLabel(appointment.startAt),
      endTimeLabel: spTimeLabel(appointment.endAt),
      status: label(APPOINTMENT_STATUS, appointment.status),
      professionalName: appointment.professional?.name ?? null,
      services: appointment.services.map((item) => item.serviceNameSnapshot),
      total: Number(appointment.total),
    })),
  });
}
