import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Prisma Client carrega packages/core/.env sozinho, mesmo sem flag nenhuma —
// isso já causou os testes baterem sem querer no banco de PRODUÇÃO uma vez.
// Aqui forçamos um banco de TESTE explícito: sem .env.test, os testes nem rodam.
const here = path.dirname(fileURLToPath(import.meta.url));
const testEnvPath = path.join(here, ".env.test");

if (!existsSync(testEnvPath)) {
  throw new Error(
    "packages/core/.env.test não existe. Copie .env.test.example e aponte para um " +
    "banco de TESTE (nunca para produção) antes de rodar `pnpm test`."
  );
}
process.loadEnvFile(testEnvPath);

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 20000,
    env: { DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL },
  },
});
