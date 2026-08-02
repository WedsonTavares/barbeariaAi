"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { validarFoto, subirParaStorage } from "@/lib/foto-upload";

const BASE = "/admin/brinquedos";


export async function createToy(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=1`;
  try {
    const data = schemas.toyInput.parse({
      name: formData.get("name"),
      category: formData.get("category"),
      description: formData.get("description") || undefined,
      purchasePrice: formData.get("purchasePrice"),
      defaultRentPrice: formData.get("defaultRentPrice"),
    });
    await services.toyService.create(tenant.id, data);
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}

function photoError(code: string, id?: string) {
  const params = new URLSearchParams({ erro: code });
  if (id) params.set("foto", id);
  return `${BASE}?${params.toString()}`;
}

/**
 * Foto do brinquedo → Supabase Storage (bucket público "toys") via REST, sem SDK.
 * Requer: bucket "toys" criado como público + SUPABASE_SERVICE_ROLE_KEY no servidor.
 */
export async function uploadToyPhoto(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  let id: string;
  try {
    id = schemas.idInput.parse(formData.get("id"));
  } catch (error) {
    if (error instanceof ZodError) redirect(photoError("foto_arquivo"));
    throw error;
  }

  const foto = await validarFoto(formData.get("photo"));
  if (!foto.ok) redirect(photoError(foto.erro, id));

  // Confirma que o brinquedo é DESTE tenant antes de subir qualquer coisa.
  const toy = await services.toyService.get(tenant.id, id);
  if (!toy) redirect(photoError("foto_arquivo", id));

  const path = `${tenant.id}/${id}-${Date.now()}.${foto.ext}`;
  const envio = await subirParaStorage("toys", path, foto.bytes, foto.type);
  if (!envio.ok) redirect(photoError(envio.erro, id));

  await services.toyService.setImage(tenant.id, id, envio.url);

  revalidatePath(BASE);
  revalidatePath("/");
  redirect(`${BASE}?ok=foto`);
}

export async function setToyStatus(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const status = schemas.toyStatus.parse(formData.get("status"));
    await services.toyService.setStatus(tenant.id, id, status);
  } catch (e) {
    if (!(e instanceof ZodError)) throw e;
  }
  revalidatePath(BASE);
}

/**
 * Remove um brinquedo. Se ele já foi usado em reservas, o histórico manda:
 * aposenta em vez de apagar (some do site e da IA, mas o passado fica).
 */
export async function removeToy(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=removido`;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const r = await services.toyService.remove(tenant.id, id);
    if (r.retired) dest = `${BASE}?ok=aposentado`;
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}
