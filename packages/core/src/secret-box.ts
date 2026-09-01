import crypto from "node:crypto";

/**
 * Caixa de segredo — AES-256-GCM, para guardar credencial no banco.
 *
 * GCM e não CBC porque ele autentica: um valor adulterado no banco falha ao
 * abrir em vez de devolver lixo que o resto do código trataria como token.
 *
 * ⚠️ O `calendar-service` tem estas mesmas três funções privadas, com o mesmo
 * algoritmo e a mesma chave. NÃO foram trocadas por estas de propósito: ele
 * guarda os refresh tokens do Google que estão em produção, e um erro na
 * unificação tiraria a agenda do ar sem aviso. Quem for unificar, faça com o
 * fluxo do Google exercitado — o formato do texto cifrado é idêntico, então a
 * troca é segura, só não é urgente.
 */

/**
 * A chave.
 *
 * `PLATFORM_SECRET_KEY` primeiro; `CALENDAR_TOKEN_ENCRYPTION_KEY` como reserva
 * porque ela JÁ está configurada em produção — assim a troca de chave da Apify
 * pela tela funciona hoje, sem depender de mexer nas variáveis da Vercel, que é
 * justamente o atrito que este recurso existe para remover.
 */
function chave(): Buffer {
  const segredo =
    process.env.PLATFORM_SECRET_KEY?.trim() || process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (!segredo) {
    throw new Error(
      "Nenhuma chave de cifra no servidor. Defina PLATFORM_SECRET_KEY (32 bytes em base64) nas variáveis de ambiente."
    );
  }
  const bruto = Buffer.from(segredo, "base64");
  if (bruto.length === 32) return bruto;
  return crypto.createHash("sha256").update(segredo).digest();
}

export function cifrar(valor: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", chave(), iv);
  const cifrado = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), cifrado].map((p) => p.toString("base64url")).join(".");
}

/**
 * Abre o valor. Devolve `null` — em vez de estourar — quando não dá.
 *
 * O caso real: a chave de cifra do servidor foi trocada e os valores antigos
 * viram ilegíveis. Estourar aí derrubaria a tela inteira de Prospecção; devolver
 * `null` faz o chamador cair no valor do ambiente e continuar funcionando.
 */
export function decifrar(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const [ivRaw, tagRaw, cifradoRaw] = valor.split(".");
  if (!ivRaw || !tagRaw || !cifradoRaw) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", chave(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(cifradoRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Últimos 4 caracteres, o resto mascarado.
 *
 * É o que a tela mostra. O suficiente para você conferir QUAL chave está ativa
 * sem que a chave inteira volte para o navegador — de onde ela iria para o
 * histórico, para a extensão instalada e para o print que você manda no grupo.
 */
export function mascarar(valor: string): string {
  const v = valor.trim();
  if (v.length <= 4) return "••••";
  return `${"•".repeat(8)}${v.slice(-4)}`;
}
