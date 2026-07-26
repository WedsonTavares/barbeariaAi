import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services } from "@diny/core";

/**
 * Filtro inicial do n8n: dado um telefone, diz se o bot PODE responder.
 * Usa as tags NATIVAS do SaaS (controladas em /admin/conversas) — se o contato
 * tem "desligar-ia"/"atendimento-humano" ou o bot foi pausado, canReply=false
 * e o workflow para ali (sem gastar IA). Auth por ?token=; tenant pelo host.
 *
 * GET  /api/agent/status?token=...&phone=5516...
 * POST /api/agent/status?token=...   body { phone }
 */
async function handle(phoneRaw: string, token: string | null) {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || token !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  const phone = phoneRaw.replace(/\D/g, "");
  if (!phone) return NextResponse.json({ error: "phone obrigatório" }, { status: 400 });

  const status = await services.conversationService.status(tenant.id, phone);
  // tenantId/tenantSlug/conversationId são a identidade que o n8n usa para
  // montar as chaves do Redis. Sem eles, memória e buffer ficavam só no
  // telefone — e dois tenants com o mesmo número dividiriam o mesmo contexto.
  return NextResponse.json({ ...status, tenantId: tenant.id, tenantSlug: tenant.slug });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return handle(url.searchParams.get("phone") ?? "", url.searchParams.get("token"));
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  return handle(String(body.phone ?? ""), url.searchParams.get("token"));
}
