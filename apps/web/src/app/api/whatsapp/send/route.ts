import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services } from "@barbearia-ai/core";
import { sendText } from "@/lib/evolution";

/**
 * O n8n chama aqui pra ENVIAR a resposta do bot: salva no inbox como "🤖 IA"
 * e manda no WhatsApp (via Evolution). Assim a resposta do workflow também
 * aparece em /admin/conversas. Autenticado por token na URL; tenant pelo host.
 */
export async function POST(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  const token = new URL(req.url).searchParams.get("token");
  if (!secret || token !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { phone?: string; text?: string };
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const text = String(body.text ?? "").trim();
  if (!phone || !text) return NextResponse.json({ error: "phone e text obrigatórios" }, { status: 400 });

  // Respeita o handoff: se o atendente assumiu, o bot não fala.
  if (!(await services.conversationService.botCanReply(tenant.id, phone))) {
    return NextResponse.json({ skipped: "bot pausado / atendimento humano" });
  }

  const instance = await services.tenantService.evolutionInstance(tenant.id, tenant.slug);
  const sent = await sendText(instance, phone, text);
  if (sent) await services.conversationService.recordOutbound(tenant.id, phone, text, "BOT");
  return NextResponse.json({ ok: sent });
}
