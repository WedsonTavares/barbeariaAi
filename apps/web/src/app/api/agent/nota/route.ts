import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services } from "@diny/core";

/**
 * Ferramenta pro agente de IA (n8n): grava um resumo do atendimento na conversa,
 * pra equipe abrir /admin/conversas e entender o contexto sem ler tudo.
 * Só escreve a nota — não muda tags, etapa nem o estado do bot.
 * Tenant pelo host. Protegido por AGENT_API_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || req.headers.get("x-diny-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { phone?: string; note?: string; nota?: string };
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const note = String(body.note ?? body.nota ?? "").trim();
  if (!phone || !note) return NextResponse.json({ error: "phone e note obrigatórios" }, { status: 400 });

  const saved = await services.conversationService.setNote(tenant.id, phone, note);
  if (!saved) return NextResponse.json({ ok: false, message: "conversa não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true, message: "Resumo salvo no painel." });
}
