import { services } from "@barbearia-ai/core";
import { ApifyConfigError, BASE } from "./apify";

/**
 * De onde sai a chave da Apify.
 *
 * ORDEM: banco primeiro, variável de ambiente depois.
 *
 * O banco vem antes porque é o único dos dois que você consegue trocar no meio
 * do trabalho: os créditos da Apify acabam sem avisar, e a saída é usar outra
 * conta. Se a ordem fosse o contrário, colar a chave nova na tela não teria
 * efeito nenhum enquanto a antiga estivesse no ambiente — o pior tipo de bug,
 * o que não dá erro.
 *
 * O ambiente continua valendo como reserva: quem nunca abriu a tela de chave
 * segue funcionando exatamente como antes, com `APIFY_TOKEN`.
 *
 * ⚠️ Arquivo SERVER-ONLY. Ele importa o core (Prisma); nunca importe daqui
 * dentro de um componente cliente.
 */

export type OrigemChave = "banco" | "ambiente" | "nenhuma";

/** A chave em claro, para usar na chamada. Nunca devolva isto para a tela. */
export async function tokenApify(): Promise<string> {
  const doBanco = await services.platformSettingService
    .get(services.CHAVES_PLATAFORMA.apifyToken)
    // Banco fora do ar não pode derrubar a busca quando o ambiente tem a chave.
    .catch(() => null);

  const t = doBanco?.trim() || process.env.APIFY_TOKEN?.trim();
  if (!t) {
    throw new ApifyConfigError(
      "Nenhuma chave da Apify configurada. Cole a chave da sua conta no campo 'Chave da conta' logo acima — ou defina APIFY_TOKEN no servidor."
    );
  }
  return t;
}

/** O que a tela pode saber: de onde veio, a máscara, e quando mudou. */
export type EstadoChave = {
  origem: OrigemChave;
  mascara: string | null;
  atualizadoEm: string | null;
  /** Nome da conta na Apify, quando a última validação conseguiu descobrir. */
  conta: string | null;
};

export async function estadoDaChave(): Promise<EstadoChave> {
  const info = await services.platformSettingService
    .info(services.CHAVES_PLATAFORMA.apifyToken)
    .catch(() => null);

  if (info) {
    return {
      origem: "banco",
      mascara: info.mascara,
      atualizadoEm: info.atualizadoEm.toISOString(),
      conta: null,
    };
  }

  const doAmbiente = process.env.APIFY_TOKEN?.trim();
  if (doAmbiente) {
    return {
      origem: "ambiente",
      // Mesma máscara do banco, para as duas origens se lerem igual na tela.
      mascara: doAmbiente.length <= 4 ? "••••" : `${"•".repeat(8)}${doAmbiente.slice(-4)}`,
      atualizadoEm: null,
      conta: null,
    };
  }

  return { origem: "nenhuma", mascara: null, atualizadoEm: null, conta: null };
}

export type TesteChave =
  | { ok: true; conta: string; creditos: string | null }
  | { ok: false; erro: string };

/**
 * Confere a chave ANTES de gravar.
 *
 * `GET /v2/users/me` não roda actor nenhum, então não consome crédito. Vale a
 * ida porque o erro que ele evita é caro: salvar uma chave com um caractere
 * faltando e só descobrir isso quatro minutos depois, no meio de uma busca.
 *
 * Devolve o nome da conta de propósito — é assim que você confirma que trocou
 * para a conta CERTA, e não colou de novo a que já tinha acabado.
 */
export async function testarChave(token: string): Promise<TesteChave> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/users/me?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, erro: "Não foi possível falar com a Apify para conferir a chave." };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, erro: "A Apify recusou esta chave. Confira se copiou inteira, sem espaços." };
  }
  if (!res.ok) return { ok: false, erro: `A Apify respondeu ${res.status} ao conferir a chave.` };

  const corpo = (await res.json().catch(() => null)) as {
    data?: { username?: string; email?: string; plan?: { id?: string } };
  } | null;

  const d = corpo?.data;
  return {
    ok: true,
    conta: d?.username || d?.email || "conta sem nome",
    creditos: d?.plan?.id ?? null,
  };
}
