/**
 * Envio de imagem pro Supabase Storage, via REST e sem SDK.
 *
 * Compartilhado entre fotos de catálogo e galeria — os dois
 * validam do mesmo jeito e sobem do mesmo jeito, então a regra vive num lugar
 * só. O binário nunca entra no banco: fica no bucket e o Postgres guarda a URL.
 *
 * Requer no servidor: bucket público criado + SUPABASE_SERVICE_ROLE_KEY.
 */

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4MB

export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Confere os primeiros bytes do arquivo contra a assinatura do formato.
 *
 * O `content-type` que o navegador manda é palpite — renomear um .exe pra .jpg
 * engana o tipo declarado, mas não os bytes iniciais.
 */
export function hasPhotoSignature(type: string, bytes: Uint8Array) {
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

export type FotoInvalida = "foto_arquivo" | "foto_tipo" | "foto_tamanho" | "foto_config";

/**
 * Valida o arquivo do formulário. Devolve os bytes e a extensão quando passa,
 * ou o código do erro — quem chamou decide como mostrar (cada tela tem a sua
 * rota de retorno).
 */
export async function validarFoto(
  file: FormDataEntryValue | null
): Promise<{ ok: true; bytes: Uint8Array; ext: string; type: string } | { ok: false; erro: FotoInvalida }> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, erro: "foto_arquivo" };

  const ext = PHOTO_TYPES[file.type];
  if (!ext) return { ok: false, erro: "foto_tipo" };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, erro: "foto_tamanho" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasPhotoSignature(file.type, bytes)) return { ok: false, erro: "foto_tipo" };

  return { ok: true, bytes, ext, type: file.type };
}

/**
 * Sobe pro bucket e devolve a URL pública.
 *
 * Separa "falta configuração no servidor" de "o upload deu errado": são
 * problemas de gente diferente — um é do dono do projeto, o outro pode ser só
 * tentar de novo.
 */
export async function subirParaStorage(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string
): Promise<{ ok: true; url: string } | { ok: false; erro: "foto_config" | "foto_storage" }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[foto] SUPABASE_URL/SERVICE_ROLE_KEY ausentes no ambiente");
    return { ok: false, erro: "foto_config" };
  }

  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${serviceKey}`,
        "content-type": contentType,
        "x-upsert": "true",
      },
      body: Buffer.from(bytes),
    });
    if (!res.ok) {
      console.error("[foto] upload falhou", res.status, await res.text().catch(() => ""));
      return { ok: false, erro: "foto_storage" };
    }
    return { ok: true, url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}` };
  } catch (error) {
    console.error("[foto] falha inesperada no upload", error);
    return { ok: false, erro: "foto_storage" };
  }
}

/**
 * Apaga o arquivo do bucket. Falha aqui não é erro de usuário: o registro já
 * saiu do banco e a foto sumiu do site — sobra um arquivo órfão no Storage,
 * que é bem menos ruim do que travar a exclusão.
 */
export async function apagarDoStorage(bucket: string, publicUrl: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  const marcador = `/storage/v1/object/public/${bucket}/`;
  const i = publicUrl.indexOf(marcador);
  if (i < 0) return; // URL de outro lugar — não é nosso pra apagar
  const path = publicUrl.slice(i + marcador.length);

  try {
    await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${serviceKey}` },
    });
  } catch (error) {
    console.error("[foto] falha ao apagar do storage (arquivo órfão)", error);
  }
}
