"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

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

const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4MB
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function photoError(code: string, id?: string) {
  const params = new URLSearchParams({ erro: code });
  if (id) params.set("foto", id);
  return `${BASE}?${params.toString()}`;
}

function hasPhotoSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= png.length && png.every((byte, index) => bytes[index] === byte);
  }
  if (type === "image/webp") {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
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

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    redirect(photoError("foto_arquivo", id));
  }

  const ext = PHOTO_TYPES[file.type];
  if (!ext) redirect(photoError("foto_tipo", id));
  if (file.size > MAX_PHOTO_BYTES) redirect(photoError("foto_tamanho", id));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[foto] SUPABASE_URL/SERVICE_ROLE_KEY ausentes no ambiente");
    redirect(photoError("foto_config", id));
  }

  // Confirma que o brinquedo é DESTE tenant antes de subir qualquer coisa.
  const toy = await services.toyService.get(tenant.id, id);
  if (!toy) redirect(photoError("foto_arquivo", id));

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasPhotoSignature(file.type, bytes)) redirect(photoError("foto_tipo", id));

  const path = `${tenant.id}/${id}-${Date.now()}.${ext}`;
  let uploadFailed = false;
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/toys/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${serviceKey}`,
        "content-type": file.type,
        "x-upsert": "true",
      },
      body: Buffer.from(bytes),
    });
    if (!res.ok) {
      console.error("[foto] upload falhou", res.status, await res.text().catch(() => ""));
      uploadFailed = true;
    } else {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/toys/${path}`;
      await services.toyService.setImage(tenant.id, id, publicUrl);
    }
  } catch (error) {
    console.error("[foto] falha inesperada no upload", error);
    uploadFailed = true;
  }
  if (uploadFailed) redirect(photoError("foto_storage", id));

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
