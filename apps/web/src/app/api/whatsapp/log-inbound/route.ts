import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services } from "@diny/core";

/**
 * O n8n chama aqui pra ESPELHAR uma mensagem recebida no inbox nativo
 * (/admin/conversas) — assim você mantém o contexto de tudo no admin, mesmo
 * com o cérebro rodando 100% no n8n. Só armazena + notifica (não aciona bot).
 * Autenticado por token na URL; tenant pelo host.
 */
export async function POST(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  const token = new URL(req.url).searchParams.get("token");
  if (!secret || token !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { phone?: string; text?: string; name?: string };
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const text = String(body.text ?? "").trim();
  if (!phone || !text) return NextResponse.json({ error: "phone e text obrigatórios" }, { status: 400 });

  await services.conversationService.recordInbound(tenant.id, phone, text, body.name?.trim() || undefined);
  return NextResponse.json({ ok: true });
}
