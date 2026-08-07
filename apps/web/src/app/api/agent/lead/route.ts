import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services, schemas, ZodError } from "@barbearia-ai/core";

/**
 * Ferramenta pro agente de IA (n8n): registra o interesse do cliente como Lead pra
 * equipe confirmar — NUNCA cria agendamento, NUNCA processa pagamento.
 * Tenant vem do host (subdomínio); o segredo conferido é o DESTE tenant.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  let input;
  try {
    input = schemas.agentLeadInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  const lead = await services.leadService.createFromAgent(tenant.id, input);
  // Grava o contexto sozinho — não depende da IA lembrar de chamar a tool "notas".
  const partes = [
    input.desiredDate && `data desejada ${input.desiredDate}`,
    input.desiredService && `interesse em ${input.desiredService}`,
    input.neighborhood && `bairro ${input.neighborhood}`,
    input.summary,
  ].filter(Boolean);
  await services.conversationService.setNote(
    tenant.id,
    input.phone,
    `Lead registrado (${input.name})${partes.length ? ": " + partes.join(", ") : ""}.`
  );
  return NextResponse.json({ ok: true, leadId: lead.id, message: "Lead registrado — a equipe vai confirmar em breve." });
}
