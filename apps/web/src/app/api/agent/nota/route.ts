import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services } from "@barbearia-ai/core";

/**
 * Ferramenta pro agente de IA (n8n): grava um resumo do atendimento na conversa,
 * pra equipe abrir /admin/conversas e entender o contexto sem ler tudo.
 * Só escreve a nota — não muda tags, etapa nem o estado do bot.
 * Tenant pelo host. Protegido pelo segredo deste tenant.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  const body = (await req.json().catch(() => ({}))) as { phone?: string; note?: string; nota?: string };
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const note = String(body.note ?? body.nota ?? "").trim();
  if (!phone || !note) return NextResponse.json({ error: "phone e note obrigatórios" }, { status: 400 });

  const saved = await services.conversationService.setNote(tenant.id, phone, note);
  if (!saved) return NextResponse.json({ ok: false, message: "conversa não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true, message: "Resumo salvo no painel." });
}
