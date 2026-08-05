"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/clientes";

export async function createCustomer(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  let dest = `${BASE}?ok=1`;
  try {
    const data = schemas.customerInput.parse({
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email") || "",
      neighborhood: formData.get("neighborhood") || undefined,
      address: formData.get("address") || undefined,
      imageConsent: formData.get("imageConsent") === "on",
    });
    await services.customerService.create(tenant.id, data);
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else if (e instanceof services.CustomerDuplicateError) dest = `${BASE}?erro=duplicado`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function updateCustomer(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);

  const rawId = String(formData.get("id") ?? "");
  let parsedId: string | null = null;
  let dest = `${BASE}?ok=editado`;
  try {
    const id = schemas.idInput.parse(rawId);
    parsedId = id;
    const data = schemas.customerUpdateInput.parse({
      name: formData.get("name"),
      email: formData.get("email") || "",
      neighborhood: formData.get("neighborhood") || undefined,
      address: formData.get("address") || undefined,
      imageConsent: formData.get("imageConsent") === "on",
    });
    const updated = await services.customerService.update(tenant.id, id, data);
    if (!updated) dest = `${BASE}?erro=nao_encontrado`;
  } catch (error) {
    if (error instanceof ZodError) {
      const params = new URLSearchParams({ erro: "edicao" });
      if (rawId) params.set("editar", rawId);
      dest = `${BASE}?${params.toString()}`;
    } else {
      throw error;
    }
  }

  revalidatePath(BASE);
  if (parsedId) revalidatePath(`${BASE}/${parsedId}`);
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  redirect(dest);
}

/** Lê um id opcional do form: string vazia/ausente vira null em vez de estourar. */
function optionalId(formData: FormData, field: string) {
  const raw = formData.get(field);
  if (typeof raw !== "string" || !raw) return null;
  const parsed = schemas.idInput.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Arquivar tira a pessoa do painel (Clientes, inbox e funil) sem apagar nada.
 * É a saída para contato errado/teste/spam: excluir de verdade esbarra no
 * histórico, e deixar na lista polui a operação do dia a dia.
 */
export async function archiveCustomerEntry(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  const target = {
    customerId: optionalId(formData, "customerId"),
    conversationId: optionalId(formData, "conversationId"),
    leadId: optionalId(formData, "leadId"),
  };

  let dest = `${BASE}?ok=arquivado`;
  if (!target.customerId && !target.conversationId && !target.leadId) {
    dest = `${BASE}?erro=nao_encontrado`;
  } else {
    const result = await services.customerService.archive(tenant.id, target);
    if (!result.archived) dest = `${BASE}?erro=nao_encontrado`;
  }

  revalidatePath(BASE);
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  redirect(dest);
}

/** Desfaz o arquivamento (botão "Restaurar" na aba Arquivados). */
export async function restoreCustomerEntry(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  const target = {
    customerId: optionalId(formData, "customerId"),
    conversationId: optionalId(formData, "conversationId"),
    leadId: optionalId(formData, "leadId"),
  };

  let dest = `${BASE}?arquivados=1&ok=restaurado`;
  if (!target.customerId && !target.conversationId && !target.leadId) {
    dest = `${BASE}?arquivados=1&erro=nao_encontrado`;
  } else {
    const result = await services.customerService.restore(tenant.id, target);
    if (!result.restored) dest = `${BASE}?arquivados=1&erro=nao_encontrado`;
  }

  revalidatePath(BASE);
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  redirect(dest);
}

/**
 * Exclusão definitiva, disparada só da aba Arquivados. Continua recusando quando
 * há histórico — nesse caso o registro simplesmente segue arquivado, que já o
 * mantém fora do painel.
 */
export async function removeCustomer(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  // Volta para a mesma aba de onde o usuário disparou a ação.
  const view = formData.get("arquivados") === "1" ? "?arquivados=1&" : "?";
  let dest = `${BASE}${view}ok=removido`;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const result = await services.customerService.removeRegistration(tenant.id, id);
    if (!result.removed) {
      const errors = {
        NOT_FOUND: "nao_encontrado",
        APPOINTMENTS: "cliente_com_agendamentos",
        HISTORY: "cliente_com_historico",
        DATA: "cliente_com_dados",
      } as const;
      dest = `${BASE}${view}erro=${errors[result.reason]}`;
    }
  } catch (error) {
    if (error instanceof ZodError) dest = `${BASE}${view}erro=nao_encontrado`;
    else throw error;
  }

  revalidatePath(BASE);
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  redirect(dest);
}
