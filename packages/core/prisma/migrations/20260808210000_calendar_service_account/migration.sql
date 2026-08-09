-- Conta de serviço da plataforma como forma alternativa de conectar o Google
-- Calendar: a empresa compartilha a agenda dela com o e-mail da conta, em vez
-- de passar pelo OAuth. Não expira e dispensa a verificação do Google.
--
-- Aditivo: nenhuma linha existente muda de provider.
ALTER TYPE "CalendarProvider" ADD VALUE IF NOT EXISTS 'GOOGLE_SERVICE_ACCOUNT';
