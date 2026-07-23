"use server";
import { redirect } from "next/navigation";
import { services, schemas, ZodError } from "@diny/core";
import { resolveTenant } from "@/lib/tenant";

/**
 * Captação pública de orçamento → vira Lead no dashboard do tenant + Notification NEW_LEAD.
 * Segurança: tenant SEMPRE resolvido pelo host (nunca do form); Zod valida; honeypot anti-bot.
 */
export async function createPublicLead(formData: FormData) {
  // Honeypot: campo invisível para humanos. Bot preencheu → fingimos sucesso e descartamos.
  if (formData.get("website")) redirect("/?lead=ok#orcamento");

  const tenant = await resolveTenant();
  if (!tenant) redirect("/");

  let dest = "/?lead=ok#orcamento";
  try {
    const data = schemas.leadInput.parse({
      name: formData.get("name"),
      phone: formData.get("phone"),
      source: "WEBSITE",
      message: formData.get("message") || undefined,
      desiredDate: formData.get("desiredDate") || undefined,
      neighborhood: formData.get("neighborhood") || undefined,
      childrenCount: formData.get("childrenCount") || undefined,
    });
    await services.leadService.create(tenant.id, data);
    await services.notificationService.create(tenant.id, {
      type: "NEW_LEAD",
      title: "Novo pedido de orçamento pelo site",
      body: [data.name, data.phone, data.neighborhood].filter(Boolean).join(" · "),
    });
  } catch (e) {
    if (e instanceof ZodError) dest = "/?lead=erro#orcamento";
    else throw e;
  }
  redirect(dest);
}
