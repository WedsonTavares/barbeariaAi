-- Histórico, tarefa com data e motivo de perda na carteira de prospecção.
-- Puramente aditivo: colunas novas são nullable e a tabela nova não existia.
-- Nada em /admin e nenhuma tabela de tenant é afetada.

CREATE TYPE "ProspectCanal" AS ENUM (
  'LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'PRESENCIAL', 'OUTRO'
);

CREATE TYPE "ProspectMotivoPerda" AS ENUM (
  'SEM_INTERESSE', 'JA_TEM_FORNECEDOR', 'SEM_ORCAMENTO', 'NAO_VE_NECESSIDADE',
  'NAO_RESPONDEU', 'CONTATO_INVALIDO', 'FORA_DO_PERFIL', 'MOMENTO_INADEQUADO',
  'PRECO', 'OUTRO'
);

ALTER TABLE "ProspectLead" ADD COLUMN "proximaAcao"   TEXT;
ALTER TABLE "ProspectLead" ADD COLUMN "proximaAcaoEm" TIMESTAMP(3);
ALTER TABLE "ProspectLead" ADD COLUMN "motivoPerda"   "ProspectMotivoPerda";

CREATE INDEX "ProspectLead_proximaAcaoEm_idx" ON "ProspectLead"("proximaAcaoEm");

CREATE TABLE "ProspectInteraction" (
  "id"        TEXT NOT NULL,
  "leadId"    TEXT NOT NULL,
  "canal"     "ProspectCanal" NOT NULL,
  "resumo"    TEXT NOT NULL,
  -- Estágio para onde o lead foi movido NESTE toque. É o que permite calcular
  -- conversão real por etapa depois, em vez de só o estado atual.
  "paraStage" "ProspectStage",
  "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProspectInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProspectInteraction_leadId_criadoEm_idx"
  ON "ProspectInteraction"("leadId", "criadoEm");

ALTER TABLE "ProspectInteraction"
  ADD CONSTRAINT "ProspectInteraction_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "ProspectLead"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
