"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { getQrCode, getConnectionState, logoutInstance, ensureInstance } from "@/lib/evolution";

const BASE = "/admin/configuracoes";

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

export async function disconnectGoogleCalendarAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  const id = schemas.idInput.parse(formData.get("id"));
  await services.calendarService.disconnect(tenant.id, id);
  revalidatePath(BASE);
}

/** Dias da semana marcados no formulário (0 = domingo). */
function readDays(formData: FormData) {
  return formData
    .getAll("days")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

/**
 * Salva um bloco do formulário. Cada seção envia só os seus campos e montamos o
 * objeto apenas com o que veio — assim salvar "Empresa" não apaga o que está
 * configurado em "Site".
 */
export async function saveSettings(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  const secao = String(formData.get("secao") ?? "");
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "secao" || key === "name" || key === "days") continue;
    if (key.startsWith("businessHours") || key.startsWith("serviceWindow")) continue;
    if (typeof value === "string") raw[key] = value;
  }
  // O expediente chega como campos soltos (start/end + checkboxes) e vira JSON.
  // A janela de montagem viaja no mesmo JSON: `businessHours` é Json livre, e
  // guardar junto evita uma migration só pra dois horários.
  if (formData.has("businessHoursStart")) {
    const serviceStart = formData.get("serviceWindowStart");
    const serviceEnd = formData.get("serviceWindowEnd");
    raw.businessHours = {
      start: formData.get("businessHoursStart"),
      end: formData.get("businessHoursEnd"),
      days: readDays(formData),
      ...(typeof serviceStart === "string" && serviceStart ? { serviceStart } : {}),
      ...(typeof serviceEnd === "string" && serviceEnd ? { serviceEnd } : {}),
    };
  }

  let dest = `${BASE}?ok=salvo`;
  try {
    // Nome da empresa fica em Tenant, não em TenantSettings.
    const nome = formData.get("name");
    if (typeof nome === "string") {
      const { name } = schemas.tenantNameInput.parse({ name: nome });
      await services.tenantService.updateName(tenant.id, name);
    }

    const data = schemas.tenantSettingsInput.parse(raw);
    await services.tenantService.updateSettings(tenant.id, data);
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const campo = issue?.path.join(".") ?? "";
      const msg = issue?.message ?? "";
      dest = `${BASE}?erro=${encodeURIComponent(campo)}&msg=${encodeURIComponent(msg)}`;
    } else {
      throw error;
    }
  }

  revalidatePath(BASE);
  revalidatePath("/"); // o site público lê nome, cores e textos daqui
  redirect(`${dest}${secao ? `#${secao}` : ""}`);
}
