import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@barbearia-ai/core";

/**
 * Ferramenta pro agente de PÓS-FESTA (n8n): fecha o atendimento explicitamente,
 * DEPOIS de registrar a nota (`/api/agent/pos-atendimento`) e agradecer o cliente.
 *
 * Existe como passo separado (em vez de já vir embutido na hora de gravar a
 * nota) porque só depois do agradecimento é que a conversa está de fato
 * encerrada — chamar antes fecharia o roteamento antes da última mensagem
 * sair. Tira a tag "pos-atendimento": a próxima mensagem deste telefone volta pro
 * atendimento normal, em vez de cair de novo no agente de nota.
 *
 * Idempotente: chamar duas vezes (ou numa conversa que já não tinha a tag)
 * não dá erro nem faz nada de errado.
 *
 * Tenant vem do host. Protegido por AGENT_API_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || req.headers.get("x-barbearia-ai-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  let input;
  try {
    input = schemas.agentLookupInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    }
    throw e;
  }

  await services.conversationService.removeTagByPhone(tenant.id, input.phone, "pos-atendimento");
  return NextResponse.json({ ok: true, message: "Atendimento de pós-atendimento encerrado." });
}
