import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { schemas, services, ZodError } from "@barbearia-ai/core";

export const dynamic = "force-dynamic";

/**
 * Histórico somente leitura para o n8n compactar antes de chamar a IA.
 * Não altera tags, notas, etapa, botPaused, unread ou mensagens.
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
    input = schemas.agentContextInput.parse(await req.json().catch(() => ({})));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "dados inválidos", details: error.issues },
        { status: 400 }
      );
    }
    throw error;
  }

  const context = await services.conversationService.context(
    tenant.id,
    input.phone,
    input.limit
  );
  return NextResponse.json(
    { ok: true, ...context },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
