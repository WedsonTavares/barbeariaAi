"use server";
import { revalidatePath } from "next/cache";

import { requireSuperAdmin, services, schemas, ZodError } from "@barbearia-ai/core";
import { getAuthContext } from "@/lib/tenant";

const BASE = "/super-admin";

export type Resultado = { ok: true } | { ok: false; erro: string };

/**
 * Porteiro de TODAS as ações desta tela.
 *
 * Diferente do resto do app, aqui o tenant NÃO vem do host: o super admin opera
 * a loja X estando em qualquer domínio, e o `tenantId` chega como argumento da
 * ação — ou seja, vindo do cliente. Por isso a checagem de permissão não pode
 * depender de nada da requisição além da sessão do Clerk. É `sessionClaims.
 * metadata.role === "super_admin"`, que só a plataforma consegue escrever.
 *
 * Sem isto, qualquer usuário logado poderia chamar a server action com o id de
 * outra empresa e suspendê-la.
 */
async function guarda() {
  requireSuperAdmin(await getAuthContext());
}

/** Converte erro de validação/permissão em mensagem — a tela nunca mostra stack. */
async function executar(fn: () => Promise<unknown>): Promise<Resultado> {
  try {
    await guarda();
    await fn();
    revalidatePath(BASE);
    return { ok: true };
  } catch (e) {
    if (e instanceof ZodError) {
      return { ok: false, erro: e.issues[0]?.message ?? "Dados inválidos" };
    }
    const msg = e instanceof Error ? e.message : "Falha inesperada";
    console.error("[super-admin] ação falhou", e);
    return { ok: false, erro: msg };
  }
}

export type ResultadoCriacao = { ok: true; slug: string } | { ok: false; erro: string };

/**
 * Cria a loja. Recusa em qualquer colisão em vez de "resolver" — ver
 * `createFromSuperAdmin`. O erro volta como texto para a tela, porque toda
 * recusa aqui é algo que a pessoa precisa corrigir e entender.
 */
export async function criarLojaAction(form: FormData): Promise<ResultadoCriacao> {
  try {
    await guarda();
    const dados = schemas.tenantCreateInput.parse({
      name: form.get("name"),
      slug: form.get("slug"),
      clerkOrgId: form.get("clerkOrgId"),
    });
    const tenant = await services.tenantService.createFromSuperAdmin(dados);
    revalidatePath(BASE);
    return { ok: true, slug: tenant.slug };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, erro: e.issues[0]?.message ?? "Dados inválidos" };
    if (e instanceof services.TenantConflictError) return { ok: false, erro: e.message };
    console.error("[super-admin] criar loja falhou", e);
    return { ok: false, erro: e instanceof Error ? e.message : "Falha inesperada" };
  }
}

/** Marca/desmarca uma etapa manual da implantação. */
export async function marcarEtapaAction(tenantId: string, step: string, done: boolean): Promise<Resultado> {
  return executar(() => services.tenantService.setSetupStep(tenantId, step, done));
}

export async function salvarAssinaturaAction(tenantId: string, form: FormData): Promise<Resultado> {
  return executar(async () => {
    const dados = schemas.tenantBillingInput.parse({
      plan: form.get("plan"),
      monthlyFee: form.get("monthlyFee") === "" ? null : form.get("monthlyFee"),
      paidUntil: form.get("paidUntil"),
      adminNotes: form.get("adminNotes"),
    });
    await services.tenantService.updateBilling(tenantId, dados);
  });
}

/** "Recebi o pagamento": empurra o vencimento N meses e carimba a data. */
export async function registrarPagamentoAction(tenantId: string, meses: number): Promise<Resultado> {
  return executar(() => services.tenantService.registerPayment(tenantId, meses));
}

export async function salvarLinksAction(tenantId: string, form: FormData): Promise<Resultado> {
  return executar(async () => {
    // Os campos vêm em pares label[]/url[]. Linha com os dois vazios é descartada
    // (é a linha em branco que a tela sempre deixa no fim para adicionar mais um).
    const labels = form.getAll("label").map(String);
    const urls = form.getAll("url").map(String);
    const brutos = labels
      .map((label, i) => ({ label: label.trim(), url: (urls[i] ?? "").trim() }))
      .filter((l) => l.label || l.url);
    const { links } = schemas.tenantLinksInput.parse({ links: brutos });
    await services.tenantService.updateLinks(tenantId, links);
  });
}

/**
 * Suspende ou reativa a loja.
 *
 * `active: false` derruba TUDO da loja de uma vez: `getTenantBySlug` passa a
 * devolver null, então painel, site público e webhook do WhatsApp param de
 * responder. É irreversível só no sentido de que o cliente percebe na hora —
 * reativar volta tudo, nada é apagado.
 */
export async function alternarAtivaAction(tenantId: string, ativa: boolean): Promise<Resultado> {
  return executar(() => services.tenantService.setActive(tenantId, ativa));
}
