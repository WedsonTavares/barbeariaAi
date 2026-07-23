import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/**
 * Ferramenta pro agente de IA (n8n): "esse brinquedo/categoria está livre nesse dia?".
 * Só leitura — nunca cria/altera reserva. Tenant vem do host (subdomínio), igual ao
 * resto do app; nunca confiar em tenantId vindo do corpo da requisição.
 * Desligado por padrão: sem AGENT_API_SECRET configurado, toda chamada é rejeitada.
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
    input = schemas.agentAvailabilityInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  const dayStart = input.date;
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const allToys = await services.toyService.list(tenant.id);
  const candidates = allToys.filter((t) => {
    if (t.status === "RETIRED") return false;
    if (input.toyId) return t.id === input.toyId;
    if (input.category) return t.category === input.category;
    return true;
  });

  const conflicts = candidates.length
    ? await services.bookingService.checkAvailability(tenant.id, candidates.map((t) => t.id), dayStart, dayEnd)
    : [];
  const conflictSet = new Set(conflicts);

  return NextResponse.json({
    date: dayStart.toISOString().slice(0, 10),
    toys: candidates.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      price: Number(t.defaultRentPrice),
      available: !conflictSet.has(t.id),
    })),
  });
}
