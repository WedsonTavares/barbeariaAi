-- Bloqueios de agenda vindos do Google Calendar.
--
-- `professionalId` passa a aceitar NULL: um compromisso na agenda da CASA não
-- pertence a ninguém em particular e bloqueia todo mundo — a mesma convenção
-- que `Appointment.professionalId` nulo já usa.
--
-- `googleEventId` é o elo com o evento lá: é por ele que a linha é reencontrada
-- quando o compromisso é movido ou apagado no Google.
ALTER TABLE "TimeOff" ALTER COLUMN "professionalId" DROP NOT NULL;
ALTER TABLE "TimeOff" ADD COLUMN IF NOT EXISTS "googleEventId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TimeOff_tenantId_googleEventId_key"
  ON "TimeOff" ("tenantId", "googleEventId");
CREATE INDEX IF NOT EXISTS "TimeOff_tenantId_startAt_endAt_idx"
  ON "TimeOff" ("tenantId", "startAt", "endAt");
