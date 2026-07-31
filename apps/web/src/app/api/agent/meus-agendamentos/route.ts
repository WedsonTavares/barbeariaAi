import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, spClock, ZodError } from "@diny/core";
import { BOOKING_STATUS, label } from "@/lib/labels";

/** HH:mm no fuso do negócio — o ISO em UTC fazia a IA anunciar 3h a mais. */
function spTimeLabel(d: Date | null) {
  if (!d) return null;
  const { hour, minute } = spClock(d);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Ferramenta pro agente de IA (n8n): "quando é meu agendamento?" / "confirma minha
 * festa". Só leitura — devolve as festas ATIVAS desse telefone (não canceladas,
 * ainda não retiradas). Tenant vem do host. Protegido por AGENT_API_SECRET.
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
    input = schemas.agentLookupInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  const bookings = await services.bookingService.upcomingForPhone(tenant.id, input.phone);

  return NextResponse.json({
    ok: true,
    count: bookings.length,
    bookings: bookings.map((b) => ({
      bookingId: b.id,
      date: spClock(b.eventDate).dayKey,
      setupTime: b.setupTime ? b.setupTime.toISOString() : null,
      pickupTime: b.pickupTime ? b.pickupTime.toISOString() : null,
      setupTimeLabel: spTimeLabel(b.setupTime),
      pickupTimeLabel: spTimeLabel(b.pickupTime),
      status: label(BOOKING_STATUS, b.status),
      toys: b.items.map((i) => i.toy.name),
      address: b.address,
      neighborhood: b.neighborhood,
      total: Number(b.total),
    })),
  });
}
