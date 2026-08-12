-- Carteira de prospecção do Super Admin.
--
-- Tabela de PLATAFORMA, como "Tenant": sem tenantId e fora da RLS por tenant.
-- Estes leads são da própria operação comercial, não de nenhuma loja — não há
-- tenant a que pertencer. Nada em /admin é alterado por esta migration.

CREATE TYPE "ProspectStage" AS ENUM (
  'NOVO', 'CONTATADO', 'RESPONDEU', 'DEMO', 'PROPOSTA', 'GANHO', 'PERDIDO'
);

CREATE TABLE "ProspectLead" (
  "id"           TEXT NOT NULL,
  -- Chave de deduplicação: reimportar a mesma região atualiza os dados públicos
  -- sem apagar estágio e anotação.
  "placeId"      TEXT NOT NULL,
  "nome"         TEXT NOT NULL,
  "nicho"        TEXT NOT NULL,
  "telefone"     TEXT,
  "site"         TEXT,
  "maps"         TEXT,
  "endereco"     TEXT,
  "nota"         DECIMAL(2,1),
  "avaliacoes"   INTEGER NOT NULL DEFAULT 0,
  "score"        INTEGER NOT NULL DEFAULT 0,
  "motivos"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "stage"        "ProspectStage" NOT NULL DEFAULT 'NOVO',
  "contatadoEm"  TIMESTAMP(3),
  "observacao"   TEXT,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProspectLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProspectLead_placeId_key" ON "ProspectLead"("placeId");
CREATE INDEX "ProspectLead_stage_idx" ON "ProspectLead"("stage");
CREATE INDEX "ProspectLead_nicho_idx" ON "ProspectLead"("nicho");
