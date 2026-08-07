import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services } from "@barbearia-ai/core";

/**
 * O n8n chama aqui pra ESPELHAR uma mensagem recebida no inbox nativo
 * (/admin/conversas) — assim você mantém o contexto de tudo no admin, mesmo
 * com o cérebro rodando 100% no n8n. Só armazena + notifica (não aciona bot).
 * Autenticado por token na URL (segredo do tenant); tenant pelo host.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  const body = (await req.json().catch(() => ({}))) as { phone?: string; text?: string; name?: string };
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const text = String(body.text ?? "").trim();
  if (!phone || !text) return NextResponse.json({ error: "phone e text obrigatórios" }, { status: 400 });

  await services.conversationService.recordInbound(tenant.id, phone, text, body.name?.trim() || undefined);
  return NextResponse.json({ ok: true });
}
