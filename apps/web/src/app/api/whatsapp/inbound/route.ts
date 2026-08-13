import { NextResponse } from "next/server";
import { after } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { brPhoneMatchKey, parseEvolution, services } from "@barbearia-ai/core";
import { sendText } from "@/lib/evolution";

/**
 * Lista de teste: enquanto ela existir, só estes números recebem resposta
 * automática. Todo o resto continua chegando no inbox normalmente — a trava é
 * na RESPOSTA, nunca no registro, senão você perderia o contato do lead.
 *
 * Vale só para o tenant nomeado em `PROSPECT_INBOX_TENANT_SLUG`, o seu. Uma
 * loja cliente jamais é silenciada por uma variável de ambiente da plataforma:
 * ela tem o próprio controle, por conversa, no painel.
 *
 * Vazia (o padrão) = todos passam, exatamente como antes.
 */
function iaLiberadaPara(slug: string, phone: string): boolean {
  const lista = process.env.AI_ALLOWLIST?.trim();
  if (!lista) return true;
  if (slug !== process.env.PROSPECT_INBOX_TENANT_SLUG?.trim()) return true;

  // Compara por chave, não por texto: assim tanto faz escrever o número na
  // variável como 16999998888, (16) 99999-8888 ou 5516999998888.
  //
  // Só vírgula, ponto-e-vírgula e quebra de linha separam — espaço NÃO, senão
  // "(16) 99999-8888" viraria dois pedaços e não casaria com número nenhum.
  const permitidos = new Set(
    lista.split(/[,;\n]+/).map((n) => brPhoneMatchKey(n)).filter(Boolean)
  );
  return permitidos.has(brPhoneMatchKey(phone));
}

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
  // Ignora: grupo/canal/status e o que não é texto nem mídia que o agente saiba
  // tratar.
  if (!parsed || parsed.ignorado || !parsed.text) {
    return NextResponse.json({ ignored: true });
  }

  // Mensagem que saiu daqui: ou foi digitada no celular — e aí precisa aparecer
  // no inbox, senão a conversa fica pela metade — ou é o eco do que o próprio
  // sistema enviou, que o service reconhece e descarta.
  //
  // Sai antes do resto de propósito: responder a si mesmo não aciona o bot, e a
  // carteira registra quando o LEAD fala, não quando você fala com ele.
  if (parsed.fromMe) {
    await services.conversationService.recordFromDevice(tenant.id, parsed.phone, parsed.text);
    return NextResponse.json({ ok: true, fromMe: true });
  }

  await services.conversationService.recordInbound(tenant.id, parsed.phone, parsed.text, parsed.name);

  const tenantId = tenant.id;
  const { phone, text, name, messageType, data: rawData } = parsed;
  const n8nUrl = process.env.N8N_AGENT_WEBHOOK_URL;
  const tenantHost = req.headers.get("host");

  /**
   * Espelha a resposta na carteira de prospecção do super admin.
   *
   * Isolado em três camadas, de propósito: só roda se `PROSPECT_INBOX_TENANT_SLUG`
   * estiver definida (sem ela, o comportamento é exatamente o de antes), só para
   * ESSE tenant, e dentro do próprio try/catch — um erro aqui não pode impedir a
   * mensagem de chegar no inbox nem o bot de responder. Nenhum tenant de cliente
   * é alcançado por este bloco.
   */
  const tenantDaPlataforma = process.env.PROSPECT_INBOX_TENANT_SLUG?.trim();
  if (tenantDaPlataforma && tenant.slug === tenantDaPlataforma) {
    after(async () => {
      try {
        const casou = await services.prospectService.registrarRespostaDeWhatsapp(phone, text);
        if (casou) console.info(`[carteira] resposta recebida de ${casou.nome} (etapa ${casou.stage})`);
      } catch (e) {
        console.error("[carteira] espelho da resposta falhou", e);
      }
    });
  }

  // Só aciona o cérebro (n8n ou bot nativo) se o bot pode responder (respeita tags/handoff).
  after(async () => {
    try {
      // A lista de teste é checada ANTES de tudo: barrando aqui, nem o n8n nem
      // o bot nativo são acionados. Um filtro dentro do workflow deixaria o
      // fallback nativo passar por fora quando o n8n estivesse indisponível.
      if (!iaLiberadaPara(tenant.slug, phone)) {
        console.info(`[ia] ${phone} fora da lista de teste — mensagem registrada, sem resposta`);
        return;
      }
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
            // O payload ORIGINAL do Evolution, sob a mesma chave `data` que ele
            // usa. É o que permite o workflow classificar mídia por
            // `data.messageType` e baixá-la por `data.key.id` — informação que
            // não existe no resumo acima e que não dá para reconstruir.
            messageType,
            data: rawData,
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
