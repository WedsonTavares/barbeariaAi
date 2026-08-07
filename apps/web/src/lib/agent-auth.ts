import { NextResponse } from "next/server";

import { services } from "@barbearia-ai/core";
import { resolveTenant } from "./tenant";

/**
 * Autenticação das ferramentas do agente de IA (`/api/agent/*`).
 *
 * O tenant vem do HOST (subdomínio) e o segredo é conferido contra o segredo
 * DAQUELE tenant — não contra um valor global. Antes havia um
 * `AGENT_API_SECRET` único: quem o obtivesse (ele viaja na URL do webhook)
 * podia chamar `https://outraloja.dominio/api/agent/*` e operar a agenda de
 * qualquer empresa. Com um segredo por empresa, o de uma não abre a da outra.
 *
 * O global continua existindo para dois casos legítimos:
 *  - `/api/agent/tenant`, que descobre o dono de uma instância ANTES de se
 *    saber qual é o tenant (por isso não pode depender de segredo de tenant);
 *  - tenants criados antes desta coluna, que ainda não têm segredo próprio —
 *    o primeiro acesso ao painel gera o deles.
 */

export type AgentAuth =
  | { ok: true; tenant: NonNullable<Awaited<ReturnType<typeof resolveTenant>>> }
  | { ok: false; response: NextResponse };

function suppliedSecret(req: Request): string | null {
  const header = req.headers.get("x-barbearia-ai-secret");
  if (header) return header;
  try {
    return new URL(req.url).searchParams.get("token");
  } catch {
    return null;
  }
}

/** Comparação em tempo constante, para o segredo não vazar por timing. */
function samesecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const unauthorized = () =>
  NextResponse.json({ error: "unauthorized" }, { status: 401 });

/**
 * Resolve o tenant pelo host e confere o segredo. Devolve o tenant ou a
 * resposta de erro pronta — a rota só precisa repassar.
 */
export async function authenticateAgent(req: Request): Promise<AgentAuth> {
  const fornecido = suppliedSecret(req);
  if (!fornecido) return { ok: false, response: unauthorized() };

  const tenant = await resolveTenant();
  if (!tenant) {
    return { ok: false, response: NextResponse.json({ error: "tenant not found" }, { status: 404 }) };
  }

  const doTenant = await services.tenantService.agentSecret(tenant.id);
  if (doTenant) {
    return samesecret(fornecido, doTenant)
      ? { ok: true, tenant }
      : { ok: false, response: unauthorized() };
  }

  // Sem segredo próprio ainda: aceita o global, para não derrubar quem já opera.
  const global = process.env.AGENT_API_SECRET;
  if (global && samesecret(fornecido, global)) return { ok: true, tenant };
  return { ok: false, response: unauthorized() };
}

/** Só para `/api/agent/tenant`, que roda antes de se saber qual é o tenant. */
export function authenticatePlatform(req: Request): NextResponse | null {
  const global = process.env.AGENT_API_SECRET;
  const fornecido = suppliedSecret(req);
  if (!global || !fornecido || !samesecret(fornecido, global)) return unauthorized();
  return null;
}
