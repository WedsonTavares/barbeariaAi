import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Testes que tocam o banco. Ficam listados num lugar só porque os dois configs
 * precisam concordar: o puro os exclui, o de integração só roda eles.
 */
export const DB_TESTS = ["**/isolation.test.ts", "**/customer-service.test.ts"];

/**
 * Bancos que os testes JAMAIS podem tocar.
 *
 * Os testes de integração não são só leitura: fazem `upsert` dos tenants
 * `test-a`/`test-b` e criam clientes. Rodar contra um banco de verdade escreve
 * lixo dentro dele.
 *
 * `bfmhmmpkqgkjgrkpqjzv` é a produção da Barbearia AI. `lgiyjpivujmhzjgkkflq` é
 * o projeto do **Diny Festas** — outro produto, outro cliente, que só continuava
 * apontado aqui por herança do fork e chegou a receber essas escritas.
 */
const FORBIDDEN_DATABASES: Record<string, string> = {
  bfmhmmpkqgkjgrkpqjzv: "produção da Barbearia AI",
  lgiyjpivujmhzjgkkflq: "projeto do Diny Festas (outro produto)",
  rzezilteejznqnmonhyi: "produção antiga herdada do fork",
};

/**
 * Carrega `.env.test` e recusa qualquer banco que não seja de teste.
 *
 * O Prisma Client lê `packages/core/.env` sozinho, sem flag nenhuma — foi assim
 * que os testes já bateram num banco que não era deles. Aqui o banco de teste é
 * explícito e conferido antes de qualquer conexão.
 */
export function loadTestDatabaseEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const testEnvPath = path.join(here, ".env.test");

  if (!existsSync(testEnvPath)) {
    throw new Error(
      "packages/core/.env.test não existe. Copie .env.test.example e aponte para um " +
        "banco de TESTE (nunca produção, nunca o de outro produto) antes de rodar `pnpm test:db`."
    );
  }
  process.loadEnvFile(testEnvPath);

  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean).join(" ");
  for (const [ref, quem] of Object.entries(FORBIDDEN_DATABASES)) {
    if (urls.includes(ref)) {
      throw new Error(
        `packages/core/.env.test aponta para o ${quem} (${ref}). Os testes ESCREVEM no banco — ` +
          "crie um projeto Supabase separado (ou um Postgres local) só para teste, aplique " +
          "`pnpm db:deploy` e `pnpm db:rls` nele, e aponte .env.test para lá."
      );
    }
  }

  return { DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL };
}
