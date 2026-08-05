# Barbearia AI

SaaS multi-tenant para barbearias e negócios de atendimento por horário.

O projeto reaproveita a estrutura técnica do sistema anterior, mas o domínio de
produto agora é agenda de serviços:

- catálogo de serviços;
- profissionais;
- clientes, conversas e funil;
- agendamentos;
- pagamentos, despesas e relatórios;
- pós-atendimento;
- integração com WhatsApp/Evolution;
- conexão com Google Calendar por tenant.

## Monorepo

```txt
apps/
  web/      Next.js, painel admin, site público e APIs do agente
  worker/   lembretes e rotinas em background
packages/
  core/     Prisma, serviços de domínio, schemas e regras compartilhadas
```

## Ambiente

Principais variáveis:

- `DATABASE_URL`
- `NEXT_PUBLIC_ROOT_DOMAIN`
- `PRIMARY_TENANT_SLUG`
- `AGENT_API_SECRET`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_PROXY_SECRET`
- `EVOLUTION_PROXY_HEADER`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_CALENDAR_WEBHOOK_URL`
- `CALENDAR_TOKEN_ENCRYPTION_KEY`

## Banco Novo

As migrations antigas foram substituídas por uma baseline nova:

```txt
packages/core/prisma/migrations/20260805120000_init_barbearia_ai
```

Nenhuma migration foi aplicada neste clone durante a adaptação.

## Comandos

```bash
pnpm install
pnpm db:generate
pnpm typecheck
pnpm --filter @barbearia-ai/core test
```

Para desenvolvimento:

```bash
pnpm dev
```

## API do Agente

As rotas ficam em `/api/agent/*` e usam `AGENT_API_SECRET` no header:

```txt
x-barbearia-ai-secret: <AGENT_API_SECRET>
```

Rotas principais:

- `POST /api/agent/info`
- `POST /api/agent/disponibilidade`
- `POST /api/agent/agendar`
- `POST /api/agent/meus-agendamentos`
- `POST /api/agent/reagendar`
- `POST /api/agent/cancelar`
- `POST /api/agent/cancelamento`
- `POST /api/agent/lead`
- `POST /api/agent/suporte`
- `POST /api/agent/pos-atendimento/positiva`
- `POST /api/agent/pos-atendimento/negativa`
- `POST /api/agent/pos-atendimento/concluir`

## Google Calendar

A tela `/admin/configuracoes#google-calendar` permite conectar uma conta Google.
Quando configurado, o sistema:

- faz OAuth por tenant;
- armazena tokens criptografados;
- cria assinatura `events.watch` quando `GOOGLE_CALENDAR_WEBHOOK_URL` existe;
- salva `syncToken` inicial;
- sincroniza agendamentos locais para o Google ao criar, remarcar, cancelar ou alterar status.

Para sincronização bidirecional completa em produção, o webhook deve processar as
notificações recebidas e executar o sync incremental usando o `syncToken` salvo.
