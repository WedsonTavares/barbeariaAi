-- Separa o RESULTADO do contato do canal e do estágio, e guarda quem decide.
--
-- Só adiciona: enum novo e colunas anuláveis. Nenhuma linha existente muda de
-- valor e nenhuma tabela de tenant é tocada.

-- CreateEnum
CREATE TYPE "ProspectResultado" AS ENUM ('NAO_RESPONDEU', 'FALEI_FUNCIONARIO', 'FALEI_RESPONSAVEL', 'PEDIU_INFO', 'DEMONSTROU_INTERESSE', 'SEM_INTERESSE', 'RETORNAR_DEPOIS', 'DEMO_REALIZADA', 'PROPOSTA_ENVIADA', 'OUTRO');

-- AlterTable
ALTER TABLE "ProspectInteraction" ADD COLUMN     "resultado" "ProspectResultado";

-- AlterTable
ALTER TABLE "ProspectLead" ADD COLUMN     "decisorCargo" TEXT,
ADD COLUMN     "decisorNome" TEXT,
ADD COLUMN     "decisorTelefone" TEXT;
