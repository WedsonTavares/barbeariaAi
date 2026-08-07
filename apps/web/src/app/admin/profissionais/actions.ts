"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole, schemas, services, ZodError } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/profissionais";

export async function createProfessionalAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=criado`;
  try {
    const data = schemas.professionalInput.parse({
      name: formData.get("name"),
      phone: formData.get("phone") || undefined,
      email: formData.get("email") || undefined,
      bio: formData.get("bio") || undefined,
      color: formData.get("color") || "#2563EB",
      defaultCalendarId: formData.get("defaultCalendarId") || undefined,
      defaultCommissionType: formData.get("defaultCommissionType") || "NONE",
      defaultCommissionValue: formData.get("defaultCommissionValue") || undefined,
    });
    await services.professionalService.create(tenant.id, data);
  } catch (error) {
    if (error instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw error;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function setProfessionalStatusAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const status = schemas.professionalStatus.parse(formData.get("status"));
    await services.professionalService.setStatus(tenant.id, id, status);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
  }
  revalidatePath(BASE);
}

/**
 * Expediente de um dia. O formulário manda um dia por vez: é o que permite
 * "sábado até 14h" sem reenviar a semana inteira.
 */
export async function saveScheduleAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=expediente`;
  try {
    const pausaInicio = String(formData.get("breakStart") ?? "").trim();
    const pausaFim = String(formData.get("breakEnd") ?? "").trim();
    const data = schemas.workingScheduleInput.parse({
      professionalId: formData.get("professionalId"),
      dayOfWeek: formData.get("dayOfWeek"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      breaks: pausaInicio && pausaFim ? [{ start: pausaInicio, end: pausaFim }] : undefined,
      active: formData.get("active") === "on",
    });
    await services.scheduleService.setDay(tenant.id, data);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    dest = `${BASE}?erro=${encodeURIComponent(error.issues[0]?.message ?? "expediente")}`;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function addTimeOffAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=folga`;
  try {
    const data = schemas.timeOffInput.parse({
      professionalId: formData.get("professionalId"),
      startAt: formData.get("startAt"),
      endAt: formData.get("endAt"),
      reason: formData.get("reason") || undefined,
    });
    await services.scheduleService.addTimeOff(tenant.id, data);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    dest = `${BASE}?erro=${encodeURIComponent(error.issues[0]?.message ?? "folga")}`;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function removeTimeOffAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  try {
    await services.scheduleService.removeTimeOff(tenant.id, schemas.idInput.parse(formData.get("id")));
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
  }
  revalidatePath(BASE);
}
