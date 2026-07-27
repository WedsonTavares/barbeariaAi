import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/** Nota mínima pra ganhar o link público. Fica aqui, não no prompt — muda num lugar só. */
const GOOD_SCORE_THRESHOLD = 8;

/**
 * Ferramenta pro agente de PÓS-FESTA (n8n): recebe a nota (0-10) que o cliente deu
 * depois do evento. QUEM DECIDE bom/ruim é o backend, não o prompt — é regra de
 * negócio, e mudar o corte não deve depender de editar um texto em linguagem natural.
 *
 * Nota >= 8: grava a avaliação e devolve o link de review pra IA repassar.
 * Nota < 8: NÃO oferece o link — escala pra equipe (pausa o bot, tira da
 * conversa "pós-festa" e joga pra "Suporte humano" no funil) e notifica.
 * Isso evita duas coisas ruins: pedir nota 5 estrelas de quem ficou insatisfeito,
 * e deixar uma experiência ruim sem ninguém saber.
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

  const good = input.score >= GOOD_SCORE_THRESHOLD;
  const resumo = `Avaliação pós-festa: nota ${input.score}/10${input.comment ? ` — "${input.comment}"` : ""}.`;
  await services.conversationService.setNote(tenant.id, input.phone, resumo);

  if (!good) {
    // Mesma mecânica do /suporte e do /cancelamento: pausa o bot, tira de
    // "pós-festa" e joga pra "Suporte humano" — alguém precisa ligar pra essa pessoa.
    await services.conversationService.takeOverByPhone(tenant.id, input.phone);
    await services.notificationService.create(tenant.id, {
      type: "POST_EVENT_LOW_RATING",
      title: "Avaliação baixa no pós-festa",
      body: `Telefone: ${input.phone.replace(/\D/g, "")} · nota ${input.score}/10${input.comment ? ` · ${input.comment}` : ""}`,
    });
    return NextResponse.json({
      ok: true,
      good: false,
      message:
        "Registrado. NÃO ofereça o link de avaliação — a equipe já foi avisada e vai entrar em contato para entender o que houve.",
    });
  }

  // Rede de segurança, não o caminho principal: quem fecha o ciclo de propósito
  // é a IA chamando /api/agent/pos-festa/concluir DEPOIS de agradecer (assim a
  // tag segura o roteamento até a última mensagem sair). Isto aqui só garante
  // que a tag não fique presa pra sempre se a IA esquecer o segundo passo —
  // é idempotente, então não conflita com o /concluir chamado em seguida.
  await services.conversationService.removeTagByPhone(tenant.id, input.phone, "pos-festa");

  const settings = await services.tenantService.getSettings(tenant.id);
  const link = settings?.reviewLink?.trim() || null;

  return NextResponse.json({
    ok: true,
    good: true,
    reviewLink: link,
    message: link
      ? `Que ótimo! Agradeça de coração e compartilhe este link pra avaliação, exatamente assim: ${link}`
      : "Que ótimo! Agradeça de coração. Ainda não há um link de avaliação configurado — não invente um.",
  });
}
