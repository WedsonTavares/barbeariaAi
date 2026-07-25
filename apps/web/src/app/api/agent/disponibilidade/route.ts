import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { parseLocalDateTime, services, schemas, ZodError } from "@diny/core";

/**
 * Ferramenta pro agente de IA (que roda no n8n): "esse brinquedo/categoria está livre
 * nesse dia?". Só leitura — nunca cria/altera reserva. Tenant vem do host (subdomínio);
 * nunca confiar em tenantId vindo do corpo. Reaproveita a MESMA checagem de conflito que
 * bloqueia reserva dupla no painel. Sem AGENT_API_SECRET, toda chamada é rejeitada.
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
  const date = dayStart.toISOString().slice(0, 10);
  const exactInterval = Boolean(input.setupTime && input.pickupTime);
  const rangeStart = exactInterval
    ? parseLocalDateTime(`${date}T${input.setupTime}`)
    : dayStart;
  const rangeEnd = exactInterval
    ? parseLocalDateTime(`${date}T${input.pickupTime}`)
    : new Date(dayStart.getTime() + 86_400_000);

  const allToys = await services.toyService.list(tenant.id);
  const term = input.toyName?.toLowerCase();
  const candidates = allToys.filter((t) => {
    // Fora do catálogo da IA: aposentado (removido) e em manutenção — assim a IA
    // nunca oferece o que a equipe tirou de circulação no painel.
    if (t.status === "RETIRED" || t.status === "MAINTENANCE") return false;
    if (term) return t.name.toLowerCase().includes(term);
    if (input.category) return t.category === input.category;
    return true;
  });

  const conflicts = candidates.length
    ? await services.bookingService.checkAvailability(tenant.id, candidates.map((t) => t.id), rangeStart, rangeEnd)
    : [];
  const conflictSet = new Set(conflicts);

  return NextResponse.json({
    date,
    scope: exactInterval ? "interval" : "day",
    setupTime: input.setupTime ?? null,
    pickupTime: input.pickupTime ?? null,
    toys: candidates.map((t) => ({
      name: t.name,
      category: t.category,
      price: Number(t.defaultRentPrice),
      available: !conflictSet.has(t.id),
    })),
  });
}
