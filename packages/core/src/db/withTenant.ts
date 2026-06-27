import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const uuid = z.string().uuid();
export type Tx = Prisma.TransactionClient;

/**
 * ÚNICO ponto que abre contexto de tenant. Toda query operacional passa por aqui.
 * Define app.current_tenant via set_config (SET LOCAL) dentro de uma transação;
 * as políticas RLS leem esse valor. Fora daqui, a RLS retorna 0 linhas (fail-closed).
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  uuid.parse(tenantId); // valida antes de tocar no banco
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return fn(tx);
  });
}

/**
 * Contexto de plataforma (SUPER_ADMIN/sistema). Use SOMENTE para a tabela Tenant
 * e operações de plataforma — NUNCA para dados operacionais de um tenant.
 */
export const platformDb = prisma;
