-- Coordenadas do lead, para visita presencial ("quem está perto de mim").
-- Só adiciona colunas anuláveis: nenhuma linha existente muda de valor.
ALTER TABLE "ProspectLead" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;
