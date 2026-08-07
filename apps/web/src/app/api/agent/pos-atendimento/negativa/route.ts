import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services, schemas, ZodError } from "@barbearia-ai/core";

/**
 * Ferramenta pro agente de pós-atendimento (n8n): o cliente deu uma avaliação ruim.
 *
 * NUNCA oferece o link de review pra quem ficou insatisfeito — escala pra
 * equipe (pausa o bot, tira de "pós-atendimento" e joga pra "Suporte humano" no
 * funil) e notifica, mesma mecânica do /suporte e do /cancelamento. Alguém
 * precisa ligar pra essa pessoa, não pedir 5 estrelas dela.
 *
 * Tenant vem do host. Protegido pelo segredo deste tenant.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  let input;
  try {
    input = schemas.agentPostServiceInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    }
    throw e;
  }

  const resumo = `Avaliação pós-atendimento: negativa${input.score != null ? ` (nota ${input.score}/10)` : ""}${input.comment ? ` — "${input.comment}"` : ""}.`;
  await services.conversationService.setNote(tenant.id, input.phone, resumo);

  // Tira a tag "pos-atendimento" como parte da mesma troca (ela filtra ALL_STAGE_TAGS).
  await services.conversationService.takeOverByPhone(tenant.id, input.phone);
  await services.notificationService.create(tenant.id, {
    type: "POST_SERVICE_LOW_RATING",
    title: "Avaliação baixa no pós-atendimento",
    body: `Telefone: ${input.phone.replace(/\D/g, "")}${input.score != null ? ` · nota ${input.score}/10` : ""}${input.comment ? ` · ${input.comment}` : ""}`,
  });

  return NextResponse.json({
    ok: true,
    message:
      "Registrado. NÃO ofereça o link de avaliação — a equipe já foi avisada e vai entrar em contato para entender o que houve.",
  });
}
