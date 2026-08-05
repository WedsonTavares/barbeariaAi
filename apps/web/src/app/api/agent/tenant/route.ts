import { NextResponse } from "next/server";
import { services } from "@barbearia-ai/core";

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
 * chamada no domínio raiz. Protegida por AGENT_API_SECRET (header ou ?token=).
 *
 * GET /api/agent/tenant?instance=barbearia-central   (header x-barbearia-ai-secret)
 */
export async function GET(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  const url = new URL(req.url);
  const token = req.headers.get("x-barbearia-ai-secret") ?? url.searchParams.get("token");
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const instance = (url.searchParams.get("instance") ?? "").trim();
  if (!instance) return NextResponse.json({ error: "instance obrigatório" }, { status: 400 });

  const tenant = await services.tenantService.byEvolutionInstance(instance);
  if (!tenant) {
    // Fail-closed de propósito: sem dono conhecido, o workflow deve parar em vez
    // de escrever a mensagem em algum tenant "padrão".
    return NextResponse.json({ error: "instance não pertence a nenhum tenant ativo" }, { status: 404 });
  }

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const host = `${tenant.slug}.${root}`;

  return NextResponse.json({
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    instance,
    host,
    apiBase: `https://${host}`,
  });
}
