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

/**
 * Foto do brinquedo → Supabase Storage (bucket público "toys") via REST, sem SDK.
 * Requer: bucket "toys" criado como público + SUPABASE_SERVICE_ROLE_KEY no servidor.
 */
export async function uploadToyPhoto(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  let dest = `${BASE}?ok=foto`;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const file = formData.get("photo");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!(file instanceof File) || file.size === 0) throw new ZodError([]);
    const ext = PHOTO_TYPES[file.type];
    if (!ext || file.size > MAX_PHOTO_BYTES) throw new ZodError([]);
    if (!supabaseUrl || !serviceKey) {
      console.error("[foto] SUPABASE_URL/SERVICE_ROLE_KEY ausentes no ambiente");
      redirect(`${BASE}?erro=foto`);
    }

    // Confirma que o brinquedo é DESTE tenant antes de subir qualquer coisa.
    const toy = await services.toyService.get(tenant.id, id);
    if (!toy) throw new ZodError([]);

    const path = `${tenant.id}/${id}-${Date.now()}.${ext}`;
    const res = await fetch(`${supabaseUrl}/storage/v1/object/toys/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${serviceKey}`,
        "content-type": file.type,
        "x-upsert": "true",
      },
      body: Buffer.from(await file.arrayBuffer()),
    });
    if (!res.ok) {
      console.error("[foto] upload falhou", res.status, await res.text().catch(() => ""));
      redirect(`${BASE}?erro=foto`);
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/toys/${path}`;
    await services.toyService.setImage(tenant.id, id, publicUrl);
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=foto`;
    else throw e;
  }
  revalidatePath(BASE);
  revalidatePath("/");
  redirect(dest);
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
