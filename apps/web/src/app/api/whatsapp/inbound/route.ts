import { NextResponse } from "next/server";
import { after } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { sendText } from "@/lib/evolution";

/**
 * Webhook do Evolution: mensagem recebida no WhatsApp → salva no inbox nativo.
 * Autenticado por token na URL (?token=AGENT_API_SECRET). Tenant vem do host
 * (o Evolution de cada empresa posta no subdomínio dela). Só ARMAZENA + notifica;
 * a resposta da IA/atendente é tratada em outro fluxo.
 */
export async function POST(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  const token = new URL(req.url).searchParams.get("token");
  if (!secret || token !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const parsed = parseEvolution(body);
  // Ignora: mensagens nossas (fromMe), grupos, e vazias.
  if (!parsed || parsed.fromMe || parsed.isGroup || !parsed.text) {
    return NextResponse.json({ ignored: true });
  }

  await services.conversationService.recordInbound(tenant.id, parsed.phone, parsed.text, parsed.name);

  // Responde ao Evolution na hora; o bot roda DEPOIS (não trava o webhook nem causa retry).
  const tenantId = tenant.id;
  const phone = parsed.phone;
  after(async () => {
    try {
      const reply = await services.botService.generateReply(tenantId, phone);
      if (reply && reply.trim()) {
        const sent = await sendText(phone, reply.trim());
        if (sent) await services.conversationService.recordOutbound(tenantId, phone, reply.trim(), "BOT");
      }
    } catch (e) {
      console.error("[bot] falha ao gerar/enviar resposta", e);
    }
  });

  return NextResponse.json({ ok: true });
}

/** Extrai { phone, text, fromMe, isGroup, name } do payload do Evolution API v2. */
function parseEvolution(body: Record<string, unknown>): { phone: string; text: string; fromMe: boolean; isGroup: boolean; name?: string } | null {
  const data = (body?.data ?? body) as Record<string, unknown> | undefined;
  const key = data?.key as Record<string, unknown> | undefined;
  if (!key) return null;
  const jid = String(key.remoteJid ?? "");
  const isGroup = jid.endsWith("@g.us");
  const phone = jid.replace("@s.whatsapp.net", "").replace("@g.us", "").replace(/\D/g, "");
  const msg = data?.message as Record<string, unknown> | undefined;
  const ext = msg?.extendedTextMessage as Record<string, unknown> | undefined;
  const text = String(msg?.conversation ?? ext?.text ?? "").trim();
  return { phone, text, fromMe: key.fromMe === true, isGroup, name: (data?.pushName as string) || undefined };
}
