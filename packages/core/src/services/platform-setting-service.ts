import { prisma } from "../db/prisma";
import { cifrar, decifrar, mascarar } from "../secret-box";

/**
 * Configuração da PLATAFORMA, trocável pela tela do super admin.
 *
 * POR QUE EXISTE
 *   A chave da Apify acaba — os créditos são por resultado — e a saída é usar
 *   outra conta. Com a chave só em variável de ambiente, trocar significa entrar
 *   na Vercel, editar e esperar um redeploy. Isso trava a prospecção no meio do
 *   trabalho, por um motivo que não tem nada de técnico.
 *
 * Tabela de PLATAFORMA, como `ProspectLead`: sem `tenantId`, fora do
 * `withTenant`, e quem protege é o `requireSuperAdmin` no app. Nenhum dono de
 * loja alcança isto.
 *
 * O valor vai sempre cifrado (`secret-box`) e NUNCA volta inteiro para a tela —
 * a UI recebe só a máscara.
 */

/** Chaves conhecidas. Lista fechada: um `set("qualquer coisa")` vira lixo eterno. */
export const CHAVES_PLATAFORMA = {
  /** Token da Apify usado pela Prospecção. */
  apifyToken: "apify_token",
} as const;

export type ChavePlataforma = (typeof CHAVES_PLATAFORMA)[keyof typeof CHAVES_PLATAFORMA];

/** O que a tela pode saber sobre um segredo guardado. Nunca o valor. */
export type InfoSegredo = {
  mascara: string;
  atualizadoEm: Date;
  atualizadoPor: string | null;
};

export const platformSettingService = {
  /**
   * O valor em claro, para o servidor usar. Nunca devolva isto a um componente.
   *
   * `null` quando não existe OU quando não abriu (chave de cifra trocada). Os
   * dois casos têm a mesma saída de propósito: o chamador cai na variável de
   * ambiente e o sistema continua de pé.
   */
  get: async (chave: ChavePlataforma): Promise<string | null> => {
    const linha = await prisma.platformSetting.findUnique({ where: { chave } });
    return decifrar(linha?.valorCifrado)?.trim() || null;
  },

  /** O que a tela mostra: máscara e quando mudou. `null` = não há valor guardado. */
  info: async (chave: ChavePlataforma): Promise<InfoSegredo | null> => {
    const linha = await prisma.platformSetting.findUnique({ where: { chave } });
    if (!linha) return null;
    const valor = decifrar(linha.valorCifrado);
    return {
      // Sem `valor` a linha existe mas não abre — dizer isso é melhor do que
      // mostrar uma máscara que sugere que está tudo certo.
      mascara: valor ? mascarar(valor) : "(ilegível — a chave de cifra do servidor mudou)",
      atualizadoEm: linha.atualizadoEm,
      atualizadoPor: linha.atualizadoPor,
    };
  },

  set: async (chave: ChavePlataforma, valor: string, porQuem: string | null): Promise<void> => {
    const limpo = valor.trim();
    if (!limpo) throw new Error("Valor vazio.");
    const valorCifrado = cifrar(limpo);
    await prisma.platformSetting.upsert({
      where: { chave },
      update: { valorCifrado, atualizadoPor: porQuem },
      create: { chave, valorCifrado, atualizadoPor: porQuem },
    });
  },

  /** Apaga o valor guardado — o sistema volta a usar a variável de ambiente. */
  limpar: async (chave: ChavePlataforma): Promise<void> => {
    await prisma.platformSetting.deleteMany({ where: { chave } });
  },
};
