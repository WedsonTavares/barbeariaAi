import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services, schemas, ZodError } from "@barbearia-ai/core";
import { sendText } from "@/lib/evolution";

/** Mensagem de transbordo — alinhada com a do system prompt do agente. */
const AVISO_TRANSBORDO =
  "Vou chamar aqui uma pessoa da equipe pra continuar com você e deixar tudo certinho no seu atendimento.";

/**
 * Ferramenta pro agente de IA (n8n): escala pra atendimento humano. Marca a
 * conversa com a tag "atendimento-humano" (pausa o bot) e notifica a equipe.
 * O n8n consulta essa tag a cada execução (buscar_tags → /api/agent/status),
 * então a próxima mensagem do cliente já não passa mais pela IA. Tenant pelo
 * host. Protegido pelo segredo deste tenant.
 *
 * O aviso ao cliente sai DAQUI, antes de pausar o bot: `/api/whatsapp/send`
 * respeita o handoff, então a resposta que o n8n manda depois desta chamada
 * cai no `skipped` e o cliente nunca ficava sabendo que foi transferido.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  let input;
  try {
    input = schemas.agentSupportInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  // Só avisa em escalonamento novo: se o bot já estava pausado, reescalar não
  // repete o aviso pro cliente. Falha no envio não impede o escalonamento —
  // avisar a equipe importa mais do que o aviso chegar.
  if (await services.conversationService.botCanReply(tenant.id, input.phone)) {
    try {
      const instance = await services.tenantService.evolutionInstance(tenant.id, tenant.slug);
      if (await sendText(instance, input.phone, AVISO_TRANSBORDO)) {
        await services.conversationService.recordOutbound(tenant.id, input.phone, AVISO_TRANSBORDO, "BOT");
      }
    } catch {
      // segue o escalonamento mesmo sem conseguir avisar
    }
  }

  await services.conversationService.takeOverByPhone(tenant.id, input.phone);
  await services.notificationService.humanRequested(tenant.id, input.phone, input.name, input.reason);
  // Grava o contexto sozinho — não depende da IA lembrar de chamar a tool "notas".
  if (input.reason) await services.conversationService.setNote(tenant.id, input.phone, `Escalado para a equipe: ${input.reason}`);

  // Resumo da conversa pra quem vai assumir — é AQUI que ele mais vale, porque
  // o atendente entra sem ter lido nada. Fica por último e dentro de try/catch
  // de propósito: o escalonamento e o aviso já aconteceram acima, então mesmo
  // que isto demore ou falhe, nada do que importa se perde. Sem OPENAI_API_KEY
  // a função devolve "sem_chave" sem chamar ninguém.
  try {
    await services.summaryService.generateByPhone(tenant.id, input.phone);
  } catch (error) {
    console.error("[suporte] resumo não gerado", error);
  }

  return NextResponse.json({ ok: true, message: "Um atendente humano foi avisado e vai continuar por aqui em breve." });
}
