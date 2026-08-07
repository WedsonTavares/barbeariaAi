import { defineConfig } from "vitest/config";

import { DB_TESTS } from "./vitest.shared";

/**
 * Suíte PURA: regras que não tocam o banco (fuso, telefone, texto, folga de
 * agenda, schemas do agente). Roda em qualquer máquina, sem credencial nenhuma.
 *
 * Os testes de integração ficam em `vitest.db.config.ts` (`pnpm test:db`):
 * eles ESCREVEM linhas e por isso exigem um banco de TESTE dedicado.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", ...DB_TESTS],
  },
});
