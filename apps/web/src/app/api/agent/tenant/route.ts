import { NextResponse } from "next/server";
import { services } from "@barbearia-ai/core";
import { tenantHost } from "@/lib/tenant-resolution";
import { authenticatePlatform } from "@/lib/agent-auth";

/**
 * Roteador multi-tenant do n8n: dada a INSTÂNCIA do Evolution que recebeu a
 * mensagem, diz de quem ela é e para qual host o workflow deve falar.
 *
 * Por que existe: todas as outras rotas resolvem o tenant pelo HOST da chamada.
 * Com um único workflow e a URL fixa de um tenant, a mensagem de outra empresa
 * seria gravada no inbox errado. Aqui a origem da verdade é a instância — que é
 * física, pertence a um tenant só e não pode ser forjada pelo cliente.
 *
 * Diferente das outras rotas de agente, esta NÃO depende do host: pode ser
 * chamada no domínio raiz. Protegida pelo segredo GLOBAL (header ou ?token=) — ver agent-auth.ts.
 *
 * GET /api/agent/tenant?instance=barbearia-central   (header x-barbearia-ai-secret)
 */
export async function GET(req: Request) {
  // Segredo GLOBAL aqui de propósito: esta rota existe justamente para
  // descobrir de quem é a instância, então não há tenant cujo segredo conferir.
  const negado = authenticatePlatform(req);
  if (negado) return negado;
  const url = new URL(req.url);

  const instance = (url.searchParams.get("instance") ?? "").trim();
  if (!instance) return NextResponse.json({ error: "instance obrigatório" }, { status: 400 });

  const tenant = await services.tenantService.byEvolutionInstance(instance);
  if (!tenant) {
    // Fail-closed de propósito: sem dono conhecido, o workflow deve parar em vez
    // de escrever a mensagem em algum tenant "padrão".
    return NextResponse.json({ error: "instance não pertence a nenhum tenant ativo" }, { status: 404 });
  }

  const host = tenantHost(tenant.slug);
  // Devolve o segredo DESTE tenant: é com ele que o n8n chama as demais
  // ferramentas. O global fica só aqui, no roteador, e nunca é exposto ao
  // dono da loja — é isso que impede um tenant de operar a agenda de outro.
  const agentSecret = await services.tenantService.ensureAgentSecret(tenant.id);

  return NextResponse.json({
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    instance,
    host,
    apiBase: `https://${host}`,
    agentSecret,
  });
}
