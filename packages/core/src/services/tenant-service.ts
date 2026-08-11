import { randomBytes } from "node:crypto";

import { prisma } from "../db/prisma";
import { withTenant } from "../db/withTenant";
import type { TenantSettingsInput } from "../schemas";

/** Instância do Evolution deste tenant (settings lidos dentro do próprio tenant). */
async function resolveInstance(tenantId: string, slug: string) {
  const s = await withTenant(tenantId, (tx) =>
    tx.tenantSettings.findUnique({ where: { tenantId }, select: { evolutionInstance: true } })
  );
  return s?.evolutionInstance?.trim() || slug;
}

/** Segredo do agente: 32 bytes em hex. Um por tenant, nunca reaproveitado. */
export function novoSegredoDeAgente() {
  return randomBytes(32).toString("hex");
}

/**
 * Slugs que não podem virar loja: já são subdomínio de serviço, rota do app, ou
 * nome que confundiria quem opera. Um slug destes sequestraria o serviço.
 */
export const RESERVED_SLUGS = [
  "www", "api", "app", "admin", "super-admin", "sign-in", "sign-up",
  "evo", "n8n", "crm", "kanban", "landing", "docs", "status", "static",
  "mail", "smtp", "ftp", "cdn", "assets", "webhook", "webhooks",
];

/** Loja nova recusada por colisão. A UI mostra a mensagem como está. */
export class TenantConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantConflictError";
  }
}

/**
 * Qual loja responde por esta instância do Evolution.
 *
 * Fora do objeto de propósito: é usado tanto pelo roteador do n8n
 * (`byEvolutionInstance`) quanto pela validação de slug na criação. As duas
 * PRECISAM usar a mesma resolução — se divergirem, a validação aprovaria um
 * slug que em produção apontaria para a instância de outra loja.
 */
async function donoDaInstancia(instance: string) {
  const target = instance.trim().toLowerCase();
  if (!target) return null;
  const tenants = await prisma.tenant.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  for (const t of tenants) {
    const configured = await resolveInstance(t.id, t.slug);
    if (configured.trim().toLowerCase() === target) return t;
  }
  return null;
}

/**
 * As três colisões de SLUG que quebrariam outra loja. Lança `TenantConflictError`
 * com a mensagem que a tela mostra; se passar, o slug está livre.
 *
 * Está fora do objeto para poder ser chamada ANTES de criar a organização no
 * Clerk. Sem isso, um slug inválido só seria descoberto depois de a org já
 * existir lá, deixando lixo do outro lado.
 */
async function assertSlugDisponivel(slug: string) {
  if (RESERVED_SLUGS.includes(slug)) {
    throw new TenantConflictError(`O slug "${slug}" é reservado do sistema. Escolha outro.`);
  }
  if (await prisma.tenant.findUnique({ where: { slug } })) {
    throw new TenantConflictError(`Já existe uma loja com o slug "${slug}".`);
  }
  // Mesma resolução que o roteador do n8n usa, para a checagem valer exatamente
  // o que vai acontecer em produção.
  const outraLoja = await donoDaInstancia(slug);
  if (outraLoja) {
    throw new TenantConflictError(
      `O slug "${slug}" já é a instância de WhatsApp da loja "${outraLoja.name}". ` +
        "Com ele, a loja nova leria as mensagens daquela. Escolha outro slug."
    );
  }
}

/** Operações de plataforma (Tenant não tem RLS) + leitura de settings por tenant. */
export const tenantService = {
  get: (tenantId: string) => prisma.tenant.findUnique({ where: { id: tenantId } }),
  getSettings: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.tenantSettings.findUnique({ where: { tenantId } })),
  /**
   * Instância do Evolution (WhatsApp) deste tenant. Cada empresa tem a sua —
   * é o que impede uma empresa de ver/desconectar o WhatsApp da outra.
   * Fallback: o slug do tenant (assim um tenant novo já nasce isolado).
   */
  evolutionInstance: (tenantId: string, slug: string) => resolveInstance(tenantId, slug),
  /**
   * Caminho inverso: dado o nome da instância do Evolution, descobre de QUEM é.
   * É o que permite um único workflow do n8n atender vários tenants sem risco de
   * misturar: quem decide o dono da mensagem é a instância que a recebeu, não a
   * URL configurada no canvas.
   *
   * Cada leitura de settings continua passando por `withTenant` (nada de bypass
   * de RLS): varremos os tenants ativos e comparamos a instância configurada.
   * São poucos tenants; se um dia forem muitos, cacheia aqui — não solta a RLS.
   */
  byEvolutionInstance: (instance: string) => donoDaInstancia(instance),
  /**
   * Segredo do agente deste tenant, criando um se ainda não existir.
   *
   * Tenants criados antes desta coluna não têm segredo; em vez de exigir
   * migração manual, o primeiro acesso gera o dele. Idempotente.
   */
  ensureAgentSecret: async (tenantId: string) => {
    const atual = await withTenant(tenantId, (tx) =>
      tx.tenantSettings.findUnique({ where: { tenantId }, select: { agentApiSecret: true } })
    );
    if (atual?.agentApiSecret) return atual.agentApiSecret;
    const segredo = novoSegredoDeAgente();
    await withTenant(tenantId, (tx) =>
      tx.tenantSettings.upsert({
        where: { tenantId },
        update: { agentApiSecret: segredo },
        create: { tenantId, agentApiSecret: segredo },
      })
    );
    return segredo;
  },

  /** Só leitura — não cria. Usado na autenticação das rotas do agente. */
  agentSecret: (tenantId: string) =>
    withTenant(tenantId, async (tx) =>
      (await tx.tenantSettings.findUnique({ where: { tenantId }, select: { agentApiSecret: true } }))
        ?.agentApiSecret ?? null
    ),

  /**
   * Grava as configurações do painel. Recebe o objeto JÁ validado por
   * `schemas.tenantSettingsInput` — que é uma lista fechada de campos. Campos
   * sensíveis (como `evolutionInstance`, que amarra o WhatsApp do tenant) não
   * estão nessa lista de propósito e não podem ser alterados por aqui.
   */
  updateSettings: (tenantId: string, data: TenantSettingsInput) =>
    withTenant(tenantId, (tx) =>
      tx.tenantSettings.upsert({
        where: { tenantId },
        update: data,
        create: { tenantId, ...data },
      })
    ),

  /** Nome da empresa (fica em `Tenant`, fora da RLS — por isso escopado por id). */
  updateName: (tenantId: string, name: string) =>
    prisma.tenant.update({ where: { id: tenantId }, data: { name: name.trim() } }),
  // plataforma / super-admin
  listAll: () => prisma.tenant.findMany({ orderBy: { createdAt: "desc" } }),
  createFromClerkOrg: async (clerkOrgId: string, slug: string, name: string) => {
    const tenant = await prisma.tenant.upsert({
      where: { clerkOrgId },
      update: { name, slug, active: true },
      create: { clerkOrgId, slug, name },
    });
    await withTenant(tenant.id, (tx) =>
      tx.tenantSettings.upsert({
        where: { tenantId: tenant.id },
        // `update` vazio de propósito: reprocessar o webhook do Clerk não pode
        // rotacionar o segredo de quem já está operando.
        update: {},
        create: { tenantId: tenant.id, agentApiSecret: novoSegredoDeAgente() },
      })
    );
    return tenant;
  },
  /** organization.deleted no Clerk → desativa (soft delete; dados ficam para auditoria). */
  deactivateByClerkOrg: (clerkOrgId: string) =>
    prisma.tenant.updateMany({ where: { clerkOrgId }, data: { active: false } }),

  /* ───────────────────────── Super Admin (plataforma) ──────────────────────
   * Tudo aqui escreve SÓ na tabela `Tenant`, o contexto de plataforma
   * sancionado (CLAUDE.md, regra 10) — ela tem RLS com policy permissiva, sem
   * FORCE, porque precisa ser lida antes de se saber o tenant (resolução de
   * subdomínio). Nenhuma destas funções toca dado operacional de
   * loja — se um dia precisar disso, use `withTenant(tenantId, …)` como o
   * resto do sistema, não amplie o bypass.
   */

  /** Um tenant pelo id, para a tela de detalhe do super admin. */
  byId: (tenantId: string) => prisma.tenant.findUnique({ where: { id: tenantId } }),

  /** Um tenant pela organização do Clerk. Usado para detectar corrida com o webhook. */
  byClerkOrgId: (clerkOrgId: string) => prisma.tenant.findUnique({ where: { clerkOrgId } }),

  /**
   * Checa o slug SEM criar nada. Existe para validar antes de criar a
   * organização no Clerk — assim um slug ruim é recusado enquanto nada foi
   * criado fora do nosso banco.
   */
  assertSlugAvailable: (slug: string) => assertSlugDisponivel(slug.trim().toLowerCase()),

  /**
   * Cria uma loja pelo Super Admin. NUNCA faz upsert — falha alto em qualquer
   * colisão. Isto é deliberado e é a diferença para `createFromClerkOrg`, que é
   * o caminho do WEBHOOK do Clerk e faz upsert de propósito (reprocessar um
   * webhook não pode dar erro). Aqui os dados vêm digitados por uma pessoa, e
   * um upsert transformaria um erro de digitação em estrago numa loja que já
   * está no ar: colar o clerkOrgId de outra loja RENOMEARIA e trocaria o slug
   * dela. Por isso: só cria, ou recusa.
   *
   * As quatro colisões que quebrariam outra loja, todas checadas antes:
   *  1. slug já usado por outra loja        -> subdomínio roubado
   *  2. slug reservado (evo, n8n, api…)     -> colide com serviço existente
   *  3. clerkOrgId já usado                 -> sequestraria a loja daquele org
   *  4. slug igual à INSTÂNCIA de outra loja -> a nova leria o WhatsApp da outra,
   *     porque `evolutionInstance` cai no slug quando não está preenchido.
   *     Esta é a mais traiçoeira: não há constraint no banco que a pegue.
   */
  createFromSuperAdmin: async (input: { name: string; slug: string; clerkOrgId: string }) => {
    const slug = input.slug.trim().toLowerCase();
    const clerkOrgId = input.clerkOrgId.trim();
    const name = input.name.trim();

    await assertSlugDisponivel(slug);
    if (await prisma.tenant.findUnique({ where: { clerkOrgId } })) {
      throw new TenantConflictError(
        "Esse Organization ID do Clerk já pertence a outra loja. Confira se copiou o da organização certa."
      );
    }

    const tenant = await prisma.tenant.create({ data: { name, slug, clerkOrgId } });
    // Segredo próprio já na criação: é ele que separa esta loja das outras nas
    // rotas do agente. Sem ele o tenant cairia no AGENT_API_SECRET global.
    await withTenant(tenant.id, (tx) =>
      tx.tenantSettings.create({
        data: { tenantId: tenant.id, agentApiSecret: novoSegredoDeAgente() },
      })
    );
    return tenant;
  },

  /** Marca/desmarca uma etapa manual da implantação (ver `setupSteps`). */
  setSetupStep: async (tenantId: string, step: string, done: boolean) => {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { setupSteps: true } });
    const atuais = Array.isArray(t?.setupSteps) ? (t.setupSteps as string[]) : [];
    const proximos = done ? [...new Set([...atuais, step])] : atuais.filter((s) => s !== step);
    return prisma.tenant.update({ where: { id: tenantId }, data: { setupSteps: proximos } });
  },

  /** Assinatura da loja. Registro manual: não cobra nada, só anota. */
  updateBilling: (
    tenantId: string,
    data: { plan?: string | null; monthlyFee?: number | null; paidUntil?: string | null; adminNotes?: string | null }
  ) =>
    prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan: data.plan?.trim() || null,
        monthlyFee: data.monthlyFee ?? null,
        // Meio-dia UTC de propósito: `new Date("2026-08-11")` seria meia-noite
        // UTC, que em São Paulo (UTC-3) cai no dia 10 e mostraria a data errada
        // na tela. Como aqui só importa o DIA, o horário é irrelevante.
        paidUntil: data.paidUntil ? new Date(`${data.paidUntil}T12:00:00.000Z`) : null,
        adminNotes: data.adminNotes?.trim() || null,
      },
    }),

  /**
   * Registra que a loja pagou: empurra `paidUntil` e carimba `lastPaymentAt`.
   * Renova a partir do vencimento atual (não de hoje) para quem paga atrasado
   * não perder os dias já pagos; se já venceu há tempos, parte de hoje para não
   * gerar um vencimento no passado.
   */
  registerPayment: async (tenantId: string, months = 1, now = new Date()) => {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { paidUntil: true } });
    const base = t?.paidUntil && t.paidUntil > now ? t.paidUntil : now;
    const next = new Date(base);
    next.setMonth(next.getMonth() + Math.max(1, Math.trunc(months)));
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { paidUntil: next, lastPaymentAt: now },
    });
  },

  /** Links úteis da loja. Substitui a lista inteira. */
  updateLinks: (tenantId: string, links: { label: string; url: string }[]) =>
    prisma.tenant.update({ where: { id: tenantId }, data: { links } }),

  /**
   * Suspende ou reativa a loja. `active: false` derruba o acesso inteiro:
   * `getTenantBySlug` devolve null, então o painel, o site público e o webhook
   * do WhatsApp param de responder por ela. É o botão mais perigoso da tela.
   */
  setActive: (tenantId: string, active: boolean) =>
    prisma.tenant.update({ where: { id: tenantId }, data: { active } }),
};
