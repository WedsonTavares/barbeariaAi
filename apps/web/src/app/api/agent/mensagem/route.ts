import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/**
 * Recebe uma mensagem de WhatsApp (via n8n, que só faz o relay) e SÓ ARMAZENA —
 * responde rápido pro n8n, sem esperar a IA. O worker processa depois de um
 * período de silêncio (debounce), agrupando rajadas de mensagens numa resposta só,
 * e manda a resposta de volta via webhook de saída (ver docs/N8N-AGENTE-IA.md).
 * Tenant vem do host (subdomínio). Desligado por padrão sem AGENT_API_SECRET.
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
    input = schemas.agentMessageInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  try {
    await services.agentService.bufferMessage(tenant.id, input.phone, input.message);
    return NextResponse.json({ buffered: true });
  } catch (e) {
    if (e instanceof services.AgentRateLimitError) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (e instanceof services.AgentNotConfiguredError) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    console.error("[agent] erro ao guardar mensagem", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
