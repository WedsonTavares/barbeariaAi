import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/**
 * Ferramenta pro agente de IA (n8n): registra o interesse do cliente como Lead pra
 * equipe confirmar — NUNCA cria reserva, NUNCA processa pagamento (isso é sempre humano).
 * Tenant vem do host (subdomínio). Sem AGENT_API_SECRET, toda chamada é rejeitada.
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
    input = schemas.agentLeadInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  const lead = await services.leadService.createFromAgent(tenant.id, input);
  return NextResponse.json({ ok: true, leadId: lead.id, message: "Lead registrado — a equipe vai confirmar em breve." });
}
