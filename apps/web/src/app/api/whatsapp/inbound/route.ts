import { NextResponse } from "next/server";
import { after } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services } from "@barbearia-ai/core";
import { sendText } from "@/lib/evolution";

/**
 * Webhook do Evolution: mensagem recebida no WhatsApp → salva no inbox nativo.
 * Autenticado por token na URL (?token=segredo do tenant). Tenant vem do host
 * (o Evolution de cada empresa posta no subdomínio dela). Só ARMAZENA + notifica;
 * a resposta da IA/atendente é tratada em outro fluxo.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const parsed = parseEvolution(body);
  // Ignora: mensagens nossas (fromMe), grupos, e vazias.
  if (!parsed || parsed.fromMe || parsed.isGroup || !parsed.text) {
    return NextResponse.json({ ignored: true });
  }

  await services.conversationService.recordInbound(tenant.id, parsed.phone, parsed.text, parsed.name);

  const tenantId = tenant.id;
  const { phone, text, name } = parsed;
  const n8nUrl = process.env.N8N_AGENT_WEBHOOK_URL;
  const tenantHost = req.headers.get("host");

  // Só aciona o cérebro (n8n ou bot nativo) se o bot pode responder (respeita tags/handoff).
  after(async () => {
    try {
      if (!(await services.conversationService.botCanReply(tenantId, phone))) return;

      if (n8nUrl) {
        // HÍBRIDO: o n8n é o cérebro (você controla o workflow). Ele responde chamando
        // /api/whatsapp/send (que salva no inbox + envia).
        //
        // Mandamos a identidade COMPLETA do tenant, e não só o host: desde que
        // cada empresa tem o seu segredo, o n8n não teria como descobri-lo a
        // partir do host (o /api/agent/tenant resolve por INSTÂNCIA). Sem isto
        // as ferramentas do agente voltariam 401.
        //
        // O segredo trafega numa chamada servidor-a-servidor, por HTTPS, para o
        // n8n que é seu. É a mesma confiança que o workflow já precisa ter.
        const [agentSecret, instance] = await Promise.all([
          services.tenantService.ensureAgentSecret(tenantId),
          services.tenantService.evolutionInstance(tenantId, tenant.slug),
        ]);
        await fetch(n8nUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            phone,
            message: text,
            name,
            tenantHost,
            tenantId,
            tenantSlug: tenant.slug,
            instance,
            apiBase: `https://${tenantHost}`,
            agentSecret,
          }),
          signal: AbortSignal.timeout(8_000),
        });
      } else {
        // Fallback: bot nativo (sem n8n configurado).
        const reply = await services.botService.generateReply(tenantId, phone);
        if (reply?.trim()) {
          const instance = await services.tenantService.evolutionInstance(tenantId, tenant.slug);
          const sent = await sendText(instance, phone, reply.trim());
          if (sent) await services.conversationService.recordOutbound(tenantId, phone, reply.trim(), "BOT");
        }
      }
    } catch (e) {
      console.error("[inbound] falha ao acionar o bot", e);
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
