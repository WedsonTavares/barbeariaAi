import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services, schemas, ZodError } from "@diny/core";

/**
 * Recebe uma mensagem de WhatsApp (via n8n, que só faz o relay) e responde com a IA.
 * Tenant vem do host (subdomínio) — o workflow do n8n chama a URL da empresa certa.
 * Desligado por padrão: sem AGENT_API_SECRET configurado, toda chamada é rejeitada.
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
    input = schemas.agentMessageInput.parse(await req.json());
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: e.issues }, { status: 400 });
    throw e;
  }

  try {
    const result = await services.agentService.handleMessage(tenant.id, input.phone, input.message);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof services.AgentRateLimitError) {
      return NextResponse.json({ error: "rate_limited", reply: "Recebi muitas mensagens suas em pouco tempo — me manda de novo daqui a pouco, ou fala com a gente direto." }, { status: 429 });
    }
    if (e instanceof services.AgentNotConfiguredError) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    console.error("[agent] erro ao processar mensagem", e);
    return NextResponse.json({ error: "internal", reply: "Deu um probleminha aqui — a equipe já foi avisada, te respondemos em breve." }, { status: 500 });
  }
}
