# Pendências

## Infra Nova

- Criar banco novo e aplicar a baseline `20260805120000_init_barbearia_ai`.
- Configurar tenant inicial com `PRIMARY_TENANT_SLUG`.
- Configurar Evolution/WhatsApp novo quando a VPS/infra estiver pronta.
- Configurar credenciais OAuth do Google Calendar.

## Google Calendar

- Processar o webhook `/api/calendar/google/webhook` com sync incremental.
- Renovar assinaturas `events.watch` antes de expirarem.
- Definir política de conflito para alterações feitas diretamente no Google.

## Produto

- Revisar textos finais do agente no n8n ou workflow equivalente.
- Ajustar serviços, profissionais e regras de agenda reais do cliente piloto.
