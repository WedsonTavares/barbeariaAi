"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { validarFoto, subirParaStorage, apagarDoStorage } from "@/lib/foto-upload";

const BASE = "/admin/galeria";
const BUCKET = "eventos";

export async function uploadEventPhoto(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  const foto = await validarFoto(formData.get("photo"));
  if (!foto.ok) redirect(`${BASE}?erro=${foto.erro}`);

  const caption = String(formData.get("caption") ?? "").slice(0, 200);
  const path = `${tenant.id}/${crypto.randomUUID()}.${foto.ext}`;
  const envio = await subirParaStorage(BUCKET, path, foto.bytes, foto.type);
  if (!envio.ok) redirect(`${BASE}?erro=${envio.erro}`);

  await services.eventPhotoService.create(tenant.id, envio.url, caption);

  revalidatePath(BASE);
  revalidatePath("/");
  redirect(`${BASE}?ok=foto`);
}

export async function updateEventPhotoCaption(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  let dest = `${BASE}?ok=legenda`;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    await services.eventPhotoService.updateCaption(
      tenant.id,
      id,
      String(formData.get("caption") ?? "").slice(0, 200)
    );
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw e;
  }
  revalidatePath(BASE);
  revalidatePath("/");
  redirect(dest);
}

export async function moveEventPhoto(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  let dest = `${BASE}?ok=ordem`;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const direcao = formData.get("direcao") === "up" ? "up" : "down";
    await services.eventPhotoService.move(tenant.id, id, direcao);
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw e;
  }
  revalidatePath(BASE);
  revalidatePath("/");
  redirect(dest);
}

export async function removeEventPhoto(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  let dest = `${BASE}?ok=removida`;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    // O service devolve a URL pra podermos limpar o arquivo — o banco é a
    // autoridade, o Storage vem depois.
    const url = await services.eventPhotoService.remove(tenant.id, id);
    if (url) await apagarDoStorage(BUCKET, url);
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw e;
  }
  revalidatePath(BASE);
  revalidatePath("/");
  redirect(dest);
}
