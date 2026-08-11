"use server";
import { revalidatePath } from "next/cache";

import { clerkClient } from "@clerk/nextjs/server";

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

export type ResultadoCriacao = { ok: true; slug: string; aviso?: string } | { ok: false; erro: string };

/**
 * Cria a loja INTEIRA: organização no Clerk + convite do dono + tenant.
 * É o caminho normal — o super admin não abre o painel do Clerk nem copia id.
 *
 * Ordem escolhida para não deixar lixo dos dois lados:
 *
 *  1. Valida o slug ANTES de tocar no Clerk. Slug ruim é recusado enquanto
 *     nada foi criado lá fora.
 *  2. Cria a organização JÁ COM O SLUG. Isso importa por causa de uma corrida:
 *     o Clerk dispara `organization.created`, e o nosso webhook cria o tenant
 *     com `slug || slugify(name)`. Passando o slug, os dois caminhos produzem
 *     exatamente a mesma loja — quem chegar primeiro acerta.
 *  3. Cria o tenant só se o webhook ainda não tiver criado.
 *  4. Convida o dono como admin.
 *
 * Se o passo 3 falhar, a organização do Clerk é apagada (rollback) — senão
 * sobraria uma org órfã lá e o slug ficaria "queimado" na prática.
 *
 * Se só o CONVITE falhar, a loja NÃO é desfeita: ela é válida e funcional, e
 * destruí-la por causa de um e-mail errado seria pior. Volta um aviso.
 */
export async function criarLojaCompletaAction(form: FormData): Promise<ResultadoCriacao> {
  let orgId: string | null = null;
  try {
    await guarda();
    const ctx = await getAuthContext();
    const { name, slug, ownerEmail } = schemas.tenantCreateWithOwnerInput.parse({
      name: form.get("name"),
      slug: form.get("slug"),
      ownerEmail: form.get("ownerEmail"),
    });

    // 1. Tudo que dá para checar antes de criar algo fora do nosso banco.
    await services.tenantService.assertSlugAvailable(slug);

    // 2. Organização no Clerk. `createdBy` é obrigatório ter um dono inicial;
    //    usamos o super admin, que já enxerga todas as lojas de qualquer forma
    //    (`requireTenantAccess` libera cedo para ele), então não ganha acesso novo.
    const clerk = await clerkClient();
    const org = await clerk.organizations.createOrganization({
      name,
      slug,
      createdBy: ctx.userId ?? undefined,
    });
    orgId = org.id;

    // 3. O webhook pode ter chegado primeiro — nesse caso a loja já existe.
    let tenant = await services.tenantService.byClerkOrgId(org.id);
    if (!tenant) {
      tenant = await services.tenantService.createFromSuperAdmin({ name, slug, clerkOrgId: org.id });
    } else if (tenant.slug !== slug) {
      // Não deveria acontecer (passamos o slug ao Clerk). Se acontecer, avisa em
      // vez de fingir que está tudo bem — o subdomínio seria outro.
      throw new Error(
        `O webhook do Clerk criou a loja com o slug "${tenant.slug}" em vez de "${slug}". Confira antes de usar.`
      );
    }

    // 4. Convite do dono. "org:admin" é papel padrão do Clerk e mapeia para
    //    ADMIN no nosso ROLE_MAP — dá acesso a tudo que o dono precisa.
    let aviso: string | undefined;
    try {
      await clerk.organizations.createOrganizationInvitation({
        organizationId: org.id,
        emailAddress: ownerEmail,
        role: "org:admin",
        inviterUserId: ctx.userId ?? undefined,
      });
    } catch (e) {
      console.error("[super-admin] convite do dono falhou", e);
      aviso = `A loja foi criada, mas o convite para ${ownerEmail} não saiu. Convide pelo painel do Clerk.`;
    }

    revalidatePath(BASE);
    return { ok: true, slug: tenant.slug, aviso };
  } catch (e) {
    // Rollback: a org do Clerk só existe se chegamos ao passo 2.
    if (orgId) {
      try {
        const clerk = await clerkClient();
        await clerk.organizations.deleteOrganization(orgId);
        console.error(`[super-admin] rollback: organização ${orgId} apagada do Clerk`);
      } catch (err) {
        console.error(`[super-admin] ROLLBACK FALHOU — organização ${orgId} ficou órfã no Clerk`, err);
      }
    }
    if (e instanceof ZodError) return { ok: false, erro: e.issues[0]?.message ?? "Dados inválidos" };
    if (e instanceof services.TenantConflictError) return { ok: false, erro: e.message };
    console.error("[super-admin] criar loja completa falhou", e);
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
