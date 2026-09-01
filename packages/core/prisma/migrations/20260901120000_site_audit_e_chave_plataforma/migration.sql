-- Auditoria do site do lead ("esse site precisa de melhoria?").
-- Só adiciona colunas anuláveis e arrays com padrão vazio: nenhuma linha
-- existente muda de valor, e a Carteira continua funcionando sem auditoria
-- nenhuma preenchida.
ALTER TABLE "ProspectLead" ADD COLUMN     "siteAuditadoEm" TIMESTAMP(3),
ADD COLUMN     "siteStatus" INTEGER,
ADD COLUMN     "siteMs" INTEGER,
ADD COLUMN     "siteOportunidade" INTEGER,
ADD COLUMN     "siteProblemas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "siteBons" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- A tela de Sites pergunta "quem ainda falta auditar" a cada volta do lote.
-- Sem índice isso é uma varredura da tabela inteira a cada 8 sites.
CREATE INDEX "ProspectLead_siteAuditadoEm_idx" ON "ProspectLead" ("siteAuditadoEm");

-- Configuração da plataforma (a chave da Apify, hoje). Valor sempre cifrado.
CREATE TABLE "PlatformSetting" (
    "chave" TEXT NOT NULL,
    "valorCifrado" TEXT NOT NULL,
    "atualizadoPor" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("chave")
);
