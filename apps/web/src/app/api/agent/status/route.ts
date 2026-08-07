import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services } from "@barbearia-ai/core";

/**
 * Filtro inicial do n8n: dado um telefone, diz se o bot PODE responder.
 * Usa as tags NATIVAS do SaaS (controladas em /admin/conversas) — se o contato
 * tem "desligar-ia"/"atendimento-humano" ou o bot foi pausado, canReply=false
 * e o workflow para ali (sem gastar IA). Auth por ?token= (segredo do tenant); tenant pelo host.
 *
 * GET  /api/agent/status?token=...&phone=5516...
 * POST /api/agent/status?token=...   body { phone }
 */
async function handle(req: Request, phoneRaw: string) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  const phone = phoneRaw.replace(/\D/g, "");
  if (!phone) return NextResponse.json({ error: "phone obrigatório" }, { status: 400 });

  const status = await services.conversationService.status(tenant.id, phone);
  // tenantId/tenantSlug/conversationId são a identidade que o n8n usa para
  // montar as chaves do Redis. Sem eles, memória e buffer ficavam só no
  // telefone — e dois tenants com o mesmo número dividiriam o mesmo contexto.
  return NextResponse.json({ ...status, tenantId: tenant.id, tenantSlug: tenant.slug });
}

export async function GET(req: Request) {
  return handle(req, new URL(req.url).searchParams.get("phone") ?? "");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  return handle(req, String(body.phone ?? ""));
}
