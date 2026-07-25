import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";
import { BOOKING_STATUS, label } from "@/lib/labels";

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
      date: b.eventDate.toISOString().slice(0, 10),
      setupTime: b.setupTime ? b.setupTime.toISOString() : null,
      pickupTime: b.pickupTime ? b.pickupTime.toISOString() : null,
      status: label(BOOKING_STATUS, b.status),
      toys: b.items.map((i) => i.toy.name),
      address: b.address,
      neighborhood: b.neighborhood,
      total: Number(b.total),
    })),
  });
}
