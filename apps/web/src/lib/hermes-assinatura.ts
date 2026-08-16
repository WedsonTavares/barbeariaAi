import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Assinatura compartilhada com o Hermes — gêmeo de `apps/hermes/src/assinatura.ts`.
 *
 * Duplicado de propósito: os dois serviços rodam em máquinas diferentes, com
 * build independente, e o Hermes não pode depender de `@barbearia-ai/core`
 * (que carrega Prisma e credencial de banco junto). São 30 linhas sem
 * dependência; um pacote compartilhado custaria mais do que resolve.
 *
 * Se mexer aqui, mexa lá também — os dois lados precisam calcular igual.
 */

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
  if (Math.abs(Date.now() - t) > JANELA_MS) return { ok: false, motivo: "requisição expirada" };

  const esperada = assinar(segredo, timestamp, corpo);
  const a = Buffer.from(assinatura, "utf8");
  const b = Buffer.from(esperada, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: "assinatura não confere" };
  }
  return { ok: true };
}
