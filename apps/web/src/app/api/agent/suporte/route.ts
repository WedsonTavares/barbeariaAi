import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/**
 * Ferramenta pro agente de IA (n8n): escala pra atendimento humano. Marca a
 * conversa com a tag "atendimento-humano" (pausa o bot) e notifica a equipe.
 * O n8n consulta essa tag a cada execução (buscar_tags → /api/agent/status),
 * então a próxima mensagem do cliente já não passa mais pela IA. Tenant pelo
 * host. Protegido por AGENT_API_SECRET.
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

  await services.conversationService.takeOverByPhone(tenant.id, input.phone);
  await services.notificationService.humanRequested(tenant.id, input.phone, input.name, input.reason);
  return NextResponse.json({ ok: true, message: "Um atendente humano foi avisado e vai continuar por aqui em breve." });
}
