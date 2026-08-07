"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseLocalDateTime, requireRole, schemas, services, ZodError } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/agendamentos";

export async function createAppointmentAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  let dest = `${BASE}?ok=criado`;

  try {
    const serviceIds = formData.getAll("serviceIds").filter((value): value is string => typeof value === "string" && value.length > 0);
    const catalog = await services.serviceCatalogService.active(tenant.id);
    const selected = catalog.filter((service) => serviceIds.includes(service.id));
    if (selected.length !== serviceIds.length || selected.length === 0) throw new Error("servico_invalido");

    const startRaw = String(formData.get("startAt") ?? "");
    const startAt = parseLocalDateTime(startRaw);
    const duration = selected.reduce((sum, service) => sum + service.durationMinutes, 0);
    const endAt = new Date(startAt.getTime() + duration * 60_000);
    const total = selected.reduce((sum, service) => sum + Number(service.defaultPrice), 0);

    const customerIdRaw = formData.get("customerId");
    const customerId =
      typeof customerIdRaw === "string" && customerIdRaw
        ? customerIdRaw
        : (await services.customerService.ensureByPhone(
            tenant.id,
            String(formData.get("phone") ?? ""),
            String(formData.get("name") ?? "")
          )).id;

    const professionalIdRaw = formData.get("professionalId");
    const data = schemas.appointmentInput.parse({
      customerId,
      professionalId: typeof professionalIdRaw === "string" && professionalIdRaw ? professionalIdRaw : undefined,
      startAt,
      endAt,
      total,
      serviceIds,
      leadSource: formData.get("phone") ? "WHATSAPP" : undefined,
      notes: formData.get("notes") || undefined,
    });
    const appointment = await services.appointmentService.create(tenant.id, data);
    await services.calendarService.syncAppointment(tenant.id, appointment.id).catch(() => {});
  } catch (error) {
    // Conflito de agenda não é "dado inválido": quem preencheu acertou tudo e
    // o horário é que está ocupado. Misturar os dois deixava o usuário
    // conferindo campo por campo atrás de um erro que não existia.
    dest = `${BASE}?erro=${erroDe(error)}`;
    if (!(error instanceof ZodError) && !(error instanceof Error)) throw error;
  }

  revalidatePath(BASE);
  revalidatePath("/admin/agenda");
  redirect(dest);
}

export async function setAppointmentStatusAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  let dest = BASE;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const status = schemas.appointmentStatus.parse(formData.get("status"));
    await services.appointmentService.setStatus(tenant.id, id, status);
    await services.calendarService.syncAppointment(tenant.id, id).catch(() => {});
  } catch (error) {
    // Reabrir um cancelado pode esbarrar em outro cliente que pegou o horário.
    // Isso precisa aparecer na tela — antes virava erro 500 sem explicação.
    if (!(error instanceof ZodError) && !(error instanceof Error)) throw error;
    dest = `${BASE}?erro=${erroDe(error)}`;
  }
  revalidatePath(BASE);
  revalidatePath("/admin/agenda");
  redirect(dest);
}

/** Traduz a exceção no código que a página sabe transformar em mensagem. */
function erroDe(error: unknown): string {
  if (error instanceof services.AppointmentConflictError) return "conflito";
  if (error instanceof services.AppointmentStateError) return "estado";
  return "validacao";
}
