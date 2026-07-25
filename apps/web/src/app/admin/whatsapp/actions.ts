"use server";
import { requireRole, services } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { getQrCode, getConnectionState, logoutInstance, ensureInstance } from "@/lib/evolution";

/** Instância do Evolution DESTE tenant (nunca uma global — isolamento entre empresas). */
async function tenantInstance() {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  return services.tenantService.evolutionInstance(tenant.id, tenant.slug);
}

export async function fetchQrAction() {
  const instance = await tenantInstance();
  // tenant novo: cria a instância dele antes de pedir o QR
  await ensureInstance(instance);
  return getQrCode(instance);
}

export async function fetchStatusAction() {
  return getConnectionState(await tenantInstance());
}

export async function disconnectAction() {
  return logoutInstance(await tenantInstance());
}
