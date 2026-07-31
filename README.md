# Diny SaaS

Sistema de gestão para locação de brinquedos de festa infantil, multi-tenant, com
atendimento por WhatsApp conduzido por um agente de IA.

Cada empresa (tenant) tem seu subdomínio, seu WhatsApp e seus dados isolados no
banco por Row Level Security. O painel administrativo cobre agenda, reservas,
clientes, financeiro e o inbox do WhatsApp; o agente de IA vive fora do repo,
no n8n, e conversa com o sistema pelas rotas `/api/agent/*`.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Web | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Autenticação | Clerk 6 (organizações = tenants) |
| Banco | PostgreSQL (Supabase) + Prisma 6, com RLS |
| Validação | Zod 3 |
| Fila / agendamento | BullMQ + Redis (worker separado) |
| WhatsApp | Evolution API (Baileys), atrás de nginx |
| Agente de IA | n8n (fora deste repositório) |
| Monorepo | Turborepo + pnpm workspaces |
| Runtime | Node >= 24, TypeScript 5.9 |
| Deploy | Vercel (web) + VPS (worker, Evolution, n8n) |

---

## Estrutura

```
apps/
  web/                    Next.js — painel + rotas de API
    src/app/(site)/       site público
    src/app/admin/        painel (protegido por Clerk)
    src/app/api/          rotas HTTP
    src/lib/              tenant.ts, evolution.ts, labels.ts
    src/middleware.ts     Clerk + redirect do domínio raiz
  worker/                 BullMQ: dispara lembretes a cada 60s

packages/
  core/                   TODA a regra de negócio
    prisma/               schema, migrations, rls.sql, seed
    src/services/         15 serviços (booking, conversation, tenant, ...)
    src/schemas/          schemas Zod (entrada de formulário e de agente)
    src/db/withTenant.ts  o único ponto que abre contexto de tenant
    src/__tests__/        testes (vitest)

docs/
  base_de_dados.md        base de conhecimento que a IA consulta
  openapi.yaml            especificação das rotas de API
  *.json                  exports dos workflows do n8n (NÃO versionados)
```

---

## Multi-tenant: como o isolamento funciona

São três camadas, e vale entender a ordem porque é onde bugs de vazamento
aparecem.

**1. O host decide o tenant.** `{slug}.{NEXT_PUBLIC_ROOT_DOMAIN}` — ou um
`customDomain` cadastrado. Resolvido em [`apps/web/src/lib/tenant.ts`](apps/web/src/lib/tenant.ts).
Nenhuma rota aceita `tenantId` vindo do corpo da requisição.

**2. O acesso passa pelo Clerk.** Cada tenant é uma organização; o usuário
precisa ser membro dela. `requireTenant()` cobre as páginas `/admin`.

**3. O banco é a última linha.** Toda query operacional passa por
[`withTenant()`](packages/core/src/db/withTenant.ts), que abre uma transação e
define `app.current_tenant` via `set_config`. As políticas RLS leem esse valor.
Fora dele a RLS devolve zero linhas — falha fechada, não aberta.

`platformDb` existe para a tabela `Tenant` (que fica fora da RLS) e nunca deve
ser usada para dado operacional.

> **Exceção conhecida:** o domínio raiz redireciona para o tenant primário
> (`dinyplay`) em [`middleware.ts`](apps/web/src/middleware.ts), e o matcher pega
> `/api/*` junto. Ver PENDENTE.md.

---

## O agente de IA

O "cérebro" roda no n8n. Este repositório expõe as **ferramentas** que ele chama.

```
WhatsApp
   ↓
Evolution API  (instância por tenant: TenantSettings.evolutionInstance)
   ↓  webhook
n8n — workflow "Multicanal"
   ├─ resolver_tenant       → GET /api/agent/tenant?instance=…   (descobre o dono)
   ├─ Espelhar no inbox     → POST /api/whatsapp/log-inbound     (grava no CRM)
   ├─ buscar_tags           → GET /api/agent/status              (o bot pode falar?)
   ├─ debounce 15s no Redis (junta mensagens picadas)
   ├─ contexto CRM          → POST /api/agent/contexto           (histórico)
   ├─ Preparar compactacao  (código Python: resume o histórico)
   ├─ AI Agent  ── tools ──→ agente_agenda (subworkflow), notas, suporte_humano,
   │                          base_conhecimento (Google Docs)
   └─ Enviar resposta       → POST /api/whatsapp/send            (envia + grava)

n8n — subworkflow "Agenda"     (chamado pela tool agente_agenda)
   roteia por toolName → disponibilidade / agendar / lead /
                         cancelamento / cancelar / reagendar
```

**Por que a instância decide o tenant, e não a URL:** com um único workflow
atendendo várias empresas, uma URL fixa gravaria a mensagem no inbox errado. A
instância do Evolution é física, pertence a um tenant só e não pode ser forjada
pelo cliente — por isso `/api/agent/tenant` existe e é a primeira chamada.

**Divisão de responsabilidade:** a API é a autoridade dos dados (conflito de
horário, preço, estado da reserva). O n8n é a autoridade da conversa (tom,
ordem das perguntas, política de pacotes). A API entrega a grade de horários de
30 em 30 minutos; quem monta os períodos de 4h/7h é o n8n.

**O que a IA nunca faz:** processar pagamento, confirmar valor fora da tabela,
cancelar reserva com sinal pago (a API recusa com `reason: "financeiro"`), ou
cancelar com menos de 24h de antecedência (regra no workflow).

---

## Rotas

Especificação completa com corpos e respostas: [`docs/openapi.yaml`](docs/openapi.yaml).

### Ferramentas do agente — `/api/agent/*`

Todas protegidas por `AGENT_API_SECRET` (header `x-diny-secret`, ou `?token=`
onde indicado). Tenant pelo host, exceto `/tenant`.

| Rota | Método | O que faz |
|---|---|---|
| `/tenant` | GET | Dado o nome da instância do Evolution, diz de quem é e qual o `apiBase`. Único que não depende do host. |
| `/status` | GET/POST | O bot pode responder? Devolve `canReply`, `botPaused`, `tags`, `conversationId`. |
| `/contexto` | POST | Histórico da conversa para o n8n compactar. Somente leitura. |
| `/info` | POST | Dados da empresa: endereço, taxa, política de sinal, catálogo. |
| `/disponibilidade` | POST | Dia inteiro, intervalo exato, ou grade de slots de 30 min (`slotMinutes: 30`). |
| `/agendar` | POST | Fecha a reserva de verdade (status CONFIRMED). Rejeita conflito. |
| `/meus-agendamentos` | POST | Festas ativas do telefone. Devolve `bookingId`. |
| `/reagendar` | POST | Muda data/hora. Não toca em preço, brinquedo, cliente ou CRM. |
| `/cancelar` | POST | Cancela e libera o horário. Recusa se houver pagamento. |
| `/cancelamento` | POST | Só REGISTRA o pedido e escala para humano. Não cancela. |
| `/lead` | POST | Registra interesse como Lead. |
| `/suporte` | POST | Escala para atendimento humano (pausa o bot). |
| `/nota` | POST | Grava resumo do atendimento na conversa. |
| `/pos-festa/positiva` | POST | Avaliação boa → devolve o link de review. |
| `/pos-festa/negativa` | POST | Avaliação ruim → escala, nunca oferece link. |
| `/pos-festa/concluir` | POST | Encerra o atendimento de pós-festa. |

### WhatsApp — `/api/whatsapp/*`

| Rota | Método | O que faz |
|---|---|---|
| `/inbound` | POST | Webhook nativo do Evolution: grava e aciona o cérebro. |
| `/log-inbound` | POST | Só espelha a mensagem no inbox (usado pelo n8n). |
| `/send` | POST | Envia pelo WhatsApp e grava como "🤖 IA". Respeita o handoff. |

### Outras

| Rota | Método | O que faz |
|---|---|---|
| `/api/webhooks/clerk` | POST | Sincroniza organização Clerk → Tenant. Assinado com svix. |

### Painel

`/admin` · `dashboard` · `agenda` · `reservas` · `clientes` · `brinquedos` ·
`financeiro` · `relatorios` · `conversas` · `funil` · `notificacoes` ·
`whatsapp` · `configuracoes`. Mais `/super-admin` e o site público.

---

## Modelo de dados

14 migrations. Entidades principais:

```
Tenant ──┬── TenantSettings   (instância do WhatsApp, preços, horários, links)
         ├── Toy              (catálogo; status AVAILABLE/RENTED/MAINTENANCE/RETIRED)
         ├── Customer ── Booking ──┬── BookingItem ── Toy
         │                         ├── Payment
         │                         ├── Expense
         │                         └── BookingReminder
         ├── Lead / Quote
         ├── Conversation ── Message      (inbox do WhatsApp)
         ├── Notification                 (sino do painel)
         ├── Maintenance
         └── AuditLog
```

Detalhes de negócio que não são óbvios pelo schema:

- **Conflito de horário** é resolvido no banco, com advisory lock por brinquedo
  (`pg_advisory_xact_lock`) + recheck dentro da transação. Duas chamadas
  simultâneas do mesmo brinquedo não geram reserva dupla.
- **Fuso**: tudo em `America/Sao_Paulo` (UTC-3 fixo, sem horário de verão desde
  2019). O servidor roda em UTC — ver [`packages/core/src/time.ts`](packages/core/src/time.ts).
- **Telefone**: normalizado por `customerPhoneKey` (55+DDD ou só DDD são a mesma
  pessoa). Ver [`packages/core/src/phone.ts`](packages/core/src/phone.ts).
- **Etapa do funil** é derivada da reserva ativa, não só do campo `stage`.

---

## Rodando local

```bash
pnpm install
cp .env.example .env.local          # preencha (valores estão na Vercel)
pnpm db:generate                    # prisma generate
pnpm dev                            # web + worker
```

Comandos úteis:

```bash
pnpm typecheck        # tsc --noEmit em todos os pacotes
pnpm build            # build de produção
pnpm test             # vitest (exige packages/core/.env.test)
pnpm db:migrate       # prisma migrate dev
pnpm db:rls           # aplica prisma/rls.sql
pnpm db:seed
```

**Multi-tenant no local:** use `lvh.me`, que resolve para 127.0.0.1 com
subdomínio. Ex.: `http://dinyplay.lvh.me:3000`.

**Testes de integração** exigem `packages/core/.env.test` apontando para um banco
**separado**. O `vitest.config.ts` recusa rodar sem esse arquivo — é uma proteção
deliberada, já houve um episódio de teste batendo em produção.

---

## O que está funcionando

- Painel completo (agenda, reservas, clientes, brinquedos, financeiro,
  relatórios, conversas, funil, notificações, configurações).
- Isolamento multi-tenant por subdomínio + Clerk + RLS.
- Inbox do WhatsApp espelhando as mensagens, com handoff para humano.
- Agente de IA no n8n: disponibilidade, agendamento, lead, suporte, notas e
  pós-festa — todos em produção.
- Worker de lembretes (entrega/retirada) rodando a cada 60s.

## O que está pronto no código mas não no ar

- `/api/agent/reagendar` e `/api/agent/cancelar` — mergeados no `main`, mas
  ainda não publicados na Vercel.
- Grade de slots de 30 min (`slotMinutes: 30` em `/api/agent/disponibilidade`).
- `bookingId` no retorno de `/api/agent/meus-agendamentos`.

Ver [PENDENTE.md](PENDENTE.md) para a lista completa, incluindo o que depende de
mudança no n8n.
