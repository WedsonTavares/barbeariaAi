"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseLocalDateTime, requireRole, schemas, services, ZodError } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/agendamentos";

export type AgendaAppointmentActionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function createAppointmentAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const returnTo = formData.get("returnTo") === "/admin/agenda" ? "/admin/agenda" : BASE;
  let dest = `${returnTo}?ok=criado`;

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
    dest = `${returnTo}?erro=${erroDe(error)}`;
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

export async function updateAgendaAppointmentAction(formData: FormData): Promise<AgendaAppointmentActionResult> {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);

  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const serviceIds = [
      ...new Set(
        formData
          .getAll("serviceIds")
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      ),
    ];
    const catalog = await services.serviceCatalogService.active(tenant.id);
    const selected = catalog.filter((service) => serviceIds.includes(service.id));
    if (selected.length !== serviceIds.length || selected.length === 0) throw new Error("servico_invalido");

    const startAt = parseLocalDateTime(String(formData.get("startAt") ?? ""));
    const duration = selected.reduce((sum, service) => sum + service.durationMinutes, 0);
    const endAt = new Date(startAt.getTime() + duration * 60_000);
    const total = selected.reduce((sum, service) => sum + Number(service.defaultPrice), 0);
    const professionalIdRaw = formData.get("professionalId");
    const notes = String(formData.get("notes") ?? "").trim();
    const data = schemas.appointmentUpdateInput.parse({
      professionalId: typeof professionalIdRaw === "string" && professionalIdRaw ? professionalIdRaw : undefined,
      startAt,
      endAt,
      total,
      serviceIds,
      notes: notes || undefined,
    });

    await services.appointmentService.update(tenant.id, id, data);
    await services.calendarService.syncAppointment(tenant.id, id).catch((error) => {
      console.error("[google-calendar] sync ao editar no painel falhou", error);
    });
    revalidateAppointmentPages();
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ZodError) && !(error instanceof Error)) throw error;
    return { ok: false, message: mensagemDeErro(error) };
  }
}

export async function cancelAgendaAppointmentAction(idRaw: string): Promise<AgendaAppointmentActionResult> {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);

  try {
    const id = schemas.idInput.parse(idRaw);
    const appointment = await services.appointmentService.get(tenant.id, id);
    if (!appointment) throw new services.AppointmentStateError("Agendamento não encontrado.");
    if (appointment.status === "COMPLETED") {
      throw new services.AppointmentStateError("Um atendimento concluído deve permanecer no histórico.");
    }

    await services.appointmentService.setStatus(tenant.id, id, "CANCELED");
    await services.calendarService.syncAppointment(tenant.id, id).catch((error) => {
      console.error("[google-calendar] sync ao cancelar no painel falhou", error);
    });
    revalidateAppointmentPages();
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ZodError) && !(error instanceof Error)) throw error;
    return { ok: false, message: mensagemDeErro(error) };
  }
}

function revalidateAppointmentPages() {
  revalidatePath(BASE);
  revalidatePath("/admin/agenda");
}

function mensagemDeErro(error: Error) {
  if (error instanceof services.AppointmentConflictError) {
    return "Esse horário já está ocupado. Escolha outro horário ou outro profissional.";
  }
  if (error instanceof services.AppointmentStateError) return error.message;
  return "Não foi possível salvar. Confira o horário e selecione ao menos um serviço.";
}

/** Traduz a exceção no código que a página sabe transformar em mensagem. */
function erroDe(error: unknown): string {
  if (error instanceof services.AppointmentConflictError) return "conflito";
  if (error instanceof services.AppointmentStateError) return "estado";
  return "validacao";
}
