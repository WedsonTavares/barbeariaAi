import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/**
 * Ferramenta pro agente de PÓS-FESTA (n8n): o cliente deu uma avaliação RUIM.
 *
 * NUNCA oferece o link de review pra quem ficou insatisfeito — escala pra
 * equipe (pausa o bot, tira de "pós-festa" e joga pra "Suporte humano" no
 * funil) e notifica, mesma mecânica do /suporte e do /cancelamento. Alguém
 * precisa ligar pra essa pessoa, não pedir 5 estrelas dela.
 *
 * Tenant vem do host. Protegido por AGENT_API_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || req.headers.get("x-diny-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  let input;
  try {
    input = schemas.agentPostEventInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    }
    throw e;
  }

  const resumo = `Avaliação pós-festa: negativa${input.score != null ? ` (nota ${input.score}/10)` : ""}${input.comment ? ` — "${input.comment}"` : ""}.`;
  await services.conversationService.setNote(tenant.id, input.phone, resumo);

  // Tira a tag "pos-festa" como parte da mesma troca (ela filtra ALL_STAGE_TAGS).
  await services.conversationService.takeOverByPhone(tenant.id, input.phone);
  await services.notificationService.create(tenant.id, {
    type: "POST_EVENT_LOW_RATING",
    title: "Avaliação baixa no pós-festa",
    body: `Telefone: ${input.phone.replace(/\D/g, "")}${input.score != null ? ` · nota ${input.score}/10` : ""}${input.comment ? ` · ${input.comment}` : ""}`,
  });

  return NextResponse.json({
    ok: true,
    message:
      "Registrado. NÃO ofereça o link de avaliação — a equipe já foi avisada e vai entrar em contato para entender o que houve.",
  });
}
