import { defineConfig } from "vitest/config";

import { DB_TESTS, loadTestDatabaseEnv } from "./vitest.shared";

/**
 * Suíte de INTEGRAÇÃO: isolamento por tenant (RLS) e diretório de clientes.
 *
 * Exige um banco de TESTE com o role `app_runtime` (sem BYPASSRLS), migrations
 * e `prisma/rls.sql` aplicados — ver `.env.test.example`. Rodando com um
 * superusuário, o teste "fail-closed" falha de propósito.
 */
const env = loadTestDatabaseEnv();

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 20000,
    include: DB_TESTS,
    env,
  },
});
