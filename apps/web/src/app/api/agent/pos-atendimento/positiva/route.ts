import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@barbearia-ai/core";

/**
 * Ferramenta pro agente de pós-atendimento (n8n): o cliente deu uma avaliação boa.
 *
 * Existe separada de `/negativa` (em vez de um único endpoint recebendo a nota
 * numérica) porque pedir pra IA preencher um `score` via $fromAI se mostrou
 * frágil: o modelo às vezes deixa o campo vazio e quebra o JSON do corpo,
 * derrubando a chamada com 400. Deixar a IA escolher qual FERRAMENTA chamar
 * é o mesmo padrão já confiável usado em `realizar_agendamento` vs
 * `registrar_interesse` — decisão categórica, não preenchimento numérico.
 *
 * Devolve o link de review pra IA repassar. `score`/`comment` são opcionais,
 * só para o relatório — não mudam o comportamento.
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
    input = schemas.agentPostServiceInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    }
    throw e;
  }

  const resumo = `Avaliação pós-atendimento: positiva${input.score != null ? ` (nota ${input.score}/10)` : ""}${input.comment ? ` — "${input.comment}"` : ""}.`;
  await services.conversationService.setNote(tenant.id, input.phone, resumo);

  // Rede de segurança, não o caminho principal: quem fecha o ciclo de propósito
  // é a IA chamando /api/agent/pos-atendimento/concluir DEPOIS de agradecer (assim a
  // tag segura o roteamento até a última mensagem sair). Isto aqui só garante
  // que a tag não fique presa pra sempre se a IA esquecer o segundo passo —
  // é idempotente, então não conflita com o /concluir chamado em seguida.
  await services.conversationService.removeTagByPhone(tenant.id, input.phone, "pos-atendimento");

  const settings = await services.tenantService.getSettings(tenant.id);
  const link = settings?.reviewLink?.trim() || null;

  return NextResponse.json({
    ok: true,
    reviewLink: link,
    message: link
      ? `Que ótimo! Agradeça de coração e compartilhe este link pra avaliação, exatamente assim: ${link}`
      : "Que ótimo! Agradeça de coração. Ainda não há um link de avaliação configurado — não invente um.",
  });
}
