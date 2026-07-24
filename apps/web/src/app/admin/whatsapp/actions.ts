"use server";
import { requireRole } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { getQrCode, getConnectionState, logoutInstance } from "@/lib/evolution";

export async function fetchQrAction() {
  const { ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  return getQrCode();
}

export async function fetchStatusAction() {
  const { ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  return getConnectionState();
}

export async function disconnectAction() {
  const { ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  return logoutInstance();
}
