import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Autenticação servidor-a-servidor entre o Next e o Hermes.
 *
 * Os dois lados guardam o mesmo segredo e assinam o corpo da requisição. Um
 * token estático no header seria suficiente para provar identidade, mas não
 * provaria que o CORPO não foi trocado no caminho — e é o corpo que diz qual
 * ferramenta chamar e com quais argumentos.
 *
 * O timestamp faz a assinatura expirar: sem ele, uma requisição capturada uma
 * vez poderia ser repetida para sempre. `timingSafeEqual` porque comparar hash
 * com `===` vaza, pelo tempo de resposta, quantos bytes iniciais bateram.
 *
 * Este arquivo é duplicado de propósito no Next (`lib/hermes-assinatura.ts`):
 * os dois serviços rodam em máquinas diferentes e não compartilham build. São
 * 30 linhas sem dependência — um pacote compartilhado custaria mais do que
 * resolve.
 */

/** Requisição assinada há mais de 5 min é recusada, mesmo com assinatura boa. */
export const JANELA_MS = 5 * 60_000;

export function assinar(segredo: string, timestamp: string, corpo: string): string {
  return createHmac("sha256", segredo).update(`${timestamp}.${corpo}`).digest("hex");
}

export type Veredito = { ok: true } | { ok: false; motivo: string };

export function conferir(
  segredo: string,
  timestamp: string | null,
  assinatura: string | null,
  corpo: string
): Veredito {
  if (!timestamp || !assinatura) return { ok: false, motivo: "sem assinatura" };

  const t = Number(timestamp);
  if (!Number.isFinite(t)) return { ok: false, motivo: "timestamp inválido" };

  // Aceita desvio nos dois sentidos: relógio de máquinas diferentes anda torto,
  // e recusar por adiantamento daria falha intermitente difícil de diagnosticar.
  if (Math.abs(Date.now() - t) > JANELA_MS) return { ok: false, motivo: "requisição expirada" };

  const esperada = assinar(segredo, timestamp, corpo);
  const a = Buffer.from(assinatura, "utf8");
  const b = Buffer.from(esperada, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: "assinatura não confere" };
  }
  return { ok: true };
}
