import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/**
 * Ferramenta pro agente de IA (n8n): escala pra atendimento humano. Cria uma
 * notificação pra equipe assumir a conversa no WhatsApp. Tenant pelo host.
 * Protegido por AGENT_API_SECRET. (Pausar o bot é feito no n8n, via flag no Redis.)
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
    input = schemas.agentSupportInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  await services.notificationService.humanRequested(tenant.id, input.phone, input.name, input.reason);
  return NextResponse.json({ ok: true, message: "Um atendente humano foi avisado e vai continuar por aqui em breve." });
}
