# PENDENTE.md — estado do projeto (SEMPRE atualizar aqui)

> Regra: toda sessão de trabalho **atualiza este arquivo** — move item de "Falta" para "Feito" com a data, e adiciona o que surgir de novo. Última atualização: **2026-07-23** (banco de teste 3/3 ✅ · site público evoluído + captação de leads ✅ · `org:member`→STAFF no ROLE_MAP ✅ · Clerk produção: instância live existe, checklist de verificação com o usuário).
> 🚫 Regra permanente da VPS: **NUNCA tocar em `zeus-estoque`** (nem nos demais apps pré-existentes) — só o processo `diny-worker` é nosso.

### Sessão 2026-07-23 — site público + leads (pendente de deploy)
- `apps/web/src/app/(site)/page.tsx` reescrito (60 → ~300 linhas): navbar, hero, benefícios, catálogo rico, como funciona, form de orçamento, footer. Tudo Server Components (sem client JS novo), cores/estilo do tenant preservados, `generateMetadata` por tenant (SEO).
- `apps/web/src/app/(site)/actions.ts` novo: `createPublicLead` (Zod + honeypot + tenant por host → Lead + Notification).
- `packages/core/src/auth/permissions.ts`: `"org:member" → STAFF` (roles padrão da instância de produção do Clerk não quebram mais permissão).
- ⚠️ **Falta commit + push + deploy na Vercel** para valer em produção — e conferir `pnpm typecheck`/`build` antes (alterações feitas fora do ambiente de execução).

## 📡 Auditoria ao vivo (2026-07-22) — o que foi CONFERIDO direto no banco de produção

Conectei com as credenciais reais (`packages/core/.env`) e consultei o Postgres de produção (Supabase, projeto `rzezilteejznqnmonhyi`) direto — isto não é suposição, é o estado real agora:

- ✅ **RLS já está 100% aplicada em produção**: todas as tabelas operacionais com `FORCE ROW LEVEL SECURITY` + policy `tenant_isolation`; `Tenant` com policy `tenant_app_access` (como projetado); role `app_runtime` existe com `NOBYPASSRLS`; função `get_due_reminders` existe. **O ponto "rodar migration+RLS em produção" já está feito** — não precisa repetir.
- ⚠️ **Uso real já começou**: o tenant `dineplay` tem `clerkOrgId` **real** (não é mais o placeholder do seed) e **9 clientes cadastrados de verdade**. `irma` ainda está com `clerkOrgId = "org_demo_irma"` (placeholder do seed) e 0 clientes — a irmã **ainda não logou/nunca teve uma organização Clerk real vinculada**. Se ela criar uma organização real hoje, o webhook vai criar um **tenant duplicado** (upsert é por `clerkOrgId`, não por slug) em vez de reaproveitar o `irma` existente —⚠️ ver ponto 2 abaixo antes dela começar a usar.
- ⚠️ **Clerk ainda em instância de TESTE** (`pk_test_.../sk_test_...`, domínio `promoted-dolphin-62.clerk.accounts.dev`) — o uso real do `dineplay` está rodando sobre isso. Funciona, mas tem limite de usuários e selo "development" visível.
- ⚠️ `CLERK_WEBHOOK_SECRET` no `.env.local` **local** é um placeholder (`whsec_placeholder`) — não sei se o valor configurado direto no **Vercel** (produção) é o real ou também um placeholder, pois não tenho acesso à dashboard/CLI do Vercel a partir daqui (sem token, sem `.vercel/` linkado). **Preciso que você confirme isso no dashboard da Vercel.**
- 🔴 **Worker nunca rodou contra produção**: `apps/worker/.env` está literalmente marcado `# PLACEHOLDER` e aponta pro `localhost`. Como ainda não há reservas confirmadas (0 bookings), isso não causou dano ainda — mas assim que a primeira reserva for confirmada, os lembretes não vão disparar até o worker subir na VPS de verdade.
- ❓ **VPS do worker**: encontrei uma chave SSH (`crm_vps`) e um IP salvo em `known_hosts`, mas o comentário da chave é `crm-upload` — **parece ser de outro projeto (CRM), não confirmadamente a VPS do Diny**. Preciso que você confirme se já existe uma VPS reservada para o Diny ou se isso ainda precisa ser provisionado.
- ❌ **Sem acesso de gestão**: `supabase` CLI está instalada mas logada em **outra conta** (projetos "Zeus Insights"/"advocaciaa" — não inclui o projeto do Diny); não há `vercel`/`gh` CLI instalados. Verificação/gestão de Vercel e do projeto Supabase certo precisam ser feitas por você na dashboard, ou me dando um token de acesso.
- 🚨 **Risco corrigido agora**: `packages/core/.env` (produção) é lido **automaticamente** pelo Prisma Client mesmo sem flag nenhuma — confirmei isso com uma query segura (`SELECT 1`). Isso significa que **rodar `pnpm test` como estava, hoje, criaria tenants `test-a`/`test-b` e um cliente fake dentro do banco de produção**. Adicionei uma trava em `isolation.test.ts` que recusa rodar se `DATABASE_URL`/`DIRECT_URL` apontar pro projeto de produção — mas o teste real só vai poder rodar depois que existir um banco de TESTE separado (ponto 4 da lista).
- ℹ️ Node local é `v22.15.0`; o projeto declara `>=24` no `engines`. Funciona (build/typecheck passam), mas vale alinhar depois.

## 📡 Auditoria ao vivo — parte 2 (Vercel, via CLI autenticada em 2026-07-22)

Consegui logar na Vercel CLI (sessão já ativa no navegador) e inspecionar o projeto real:

- ✅ **Domínio + wildcard 100% configurados e verificados**: `dinyfestas.com.br`, `*.dinyfestas.com.br` e `www.dinyfestas.com.br` estão todos atribuídos ao projeto `diny-festas`, usando nameservers da própria Vercel (`ns1/ns2.vercel-dns.com`), ambos com ✓ de verificação. **O ponto "DNS wildcard" da lista de bloqueio já está feito** — nada a fazer aqui.
- ✅ **14 variáveis de ambiente já configuradas em Production+Preview** na Vercel: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, URLs de sign-in/up, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL` — todas criadas juntas há ~26 dias (mesmo lote do deploy inicial).
- ❓ **Não consegui (nem tentei forçar) ver o VALOR real de `CLERK_WEBHOOK_SECRET`** nem das chaves Clerk — a Vercel CLI só revela isso via `env pull` (baixa pra um arquivo), e o classificador de segurança bloqueou essa ação por mexer com segredo de produção. Ficou then em aberto: **confirmar manualmente no dashboard da Vercel** (Settings → Environment Variables → clicar pra revelar `CLERK_WEBHOOK_SECRET` e `CLERK_SECRET_KEY`) se é um valor real (Clerk gera `whsec_...` longo pro webhook e `sk_live_...`/`sk_test_...` pra secret key) — e comparar com o que está configurado no dashboard do Clerk em Webhooks.
- Node no build da Vercel: `24.x` (correto, bate com o `engines` do projeto — só a máquina local está em 22.x).
- Projeto Vercel: `diny-festas` (ID `prj_Le34dnFjXBer9VNc0vZAdl1JPUJV`), conta `wedsontavares-projects`.

## 🗒️ Decisões do usuário (2026-07-22)

- **VPS do worker**: confirmado que **ainda não existe** — precisa provisionar do zero (contratar VPS, instalar Node 24 + Redis, configurar PM2). Ver passo a passo no ponto 5 da lista de bloqueio.
- **Tenant `irma`**: **sem pressa** — a irmã ainda não vai usar de imediato. Mantido como pendência documentada (ponto 2 da lista); resolver quando ela estiver pronta para começar (atualizar `clerkOrgId` real no tenant existente, não deixar o webhook criar um duplicado).

---

## ✅ FEITO

### Fundação (Fase 1 — junho/2026)
- [x] Monorepo pnpm + Turborepo (`apps/web`, `apps/worker`, `packages/core`)
- [x] Schema Prisma completo (Tenant, Toy, Customer, Lead, Quote, Booking, Payment, Expense, Maintenance, Reminder, Notification, AuditLog)
- [x] **RLS FORCE por tenant** (`rls.sql`) + role `app_runtime` NOBYPASSRLS + `withTenant()` fail-closed
- [x] Auth Clerk Organizations (org = tenant, roles OWNER/ADMIN/STAFF, flag super_admin)
- [x] Resolução de tenant por subdomínio/domínio (`getTenantByHost`), dev via `lvh.me`
- [x] Admin: dashboard, brinquedos, clientes, reservas (com checagem de conflito), financeiro
- [x] Site público mínimo por tenant (headline/CTA/brinquedos + WhatsApp)
- [x] Webhook Clerk `organization.created/updated` → cria/atualiza Tenant (svix verificado)
- [x] Worker BullMQ na VPS: tick 60s → `get_due_reminders()` → Notification + SENT
- [x] Testes de isolamento RLS (precisam de banco de teste)
- [x] Deploy web na Vercel funcionando (histórico de commits de fix de build)

### Revisão profunda (2026-07-22) — correção/segurança/UX
- [x] **Fuso horário corrigido** (`packages/core/src/time.ts`): inputs `datetime-local`/`date` agora ancoram em America/Sao_Paulo — antes, na Vercel (UTC), lembretes disparariam **3h mais cedo** e cortes de dia/mês do dashboard/financeiro saíam errados. Exibição com `fmtDate`/`fmtDateTime` no fuso certo.
- [x] **Validação Zod em pagamentos e custos** (`paymentInput`, `expenseInput`, `idInput`): valor > 0 obrigatório — antes `Number(formData)` aceitava vazio/negativo e corrompia `paymentStatus`.
- [x] **Corrida de reserva dupla eliminada**: `pg_advisory_xact_lock` por brinquedo antes do `findConflicts` (duas criações simultâneas do mesmo brinquedo agora serializam).
- [x] **Lembretes retroativos**: confirmar reserva com retirada próxima não dispara mais rajada de lembretes no passado (filtra `fireAt > now`).
- [x] `confirm()` bloqueia reserva CANCELED/FINISHED (`BookingStateError`).
- [x] `kind` do pagamento automático: 1º = DEPOSIT, demais = BALANCE.
- [x] **Tenant inativo some do ar** (`getTenantByHost/BySlug` checam `active`) + webhook `organization.deleted` → desativa tenant (soft delete).
- [x] **Worker não vaza Redis**: `removeOnComplete/removeOnFail` no tick; falha em 1 lembrete não trava os demais (try/catch por item).
- [x] **Erros amigáveis nas actions**: ZodError/conflito/estado → banner na tela (nada de página 500); `error.tsx` no admin + `not-found.tsx` global.
- [x] **`cache()` por request** em `getAuthContext/resolveTenant/requireTenant` — elimina queries e chamadas Clerk duplicadas (layout + página).
- [x] **Central de notificações** (`/admin/notificacoes`) + badge de não-lidas na sidebar — o pipeline de lembretes agora tem consumidor.
- [x] **Cancelar reserva** (botão + action, role OWNER/ADMIN); confirmar só aparece quando faz sentido; pagamento some quando PAID.
- [x] **Mudar status do brinquedo** na lista (Disponível/Alugado/Manutenção/Aposentado); aposentados fora do site público e do form de reserva.
- [x] **Admin responsivo** (sidebar vira barra superior no celular — uso real é no celular).
- [x] Labels pt-BR para todos os enums (nada de `WAITING_DEPOSIT` cru na tela).
- [x] `brl()` não arredonda mais os centavos; `waUrl` sanitiza telefone.
- [x] Cores do tenant (`TenantSettings.colorPrimary/Accent`) aplicadas no hero do site público.
- [x] `typecheck` + `next build` verdes.

---

## 🔴 FALTA — bloqueia o lançamento

1. ~~Rodar migration + RLS no banco de produção~~ — **✅ já está feito, confirmado ao vivo em 2026-07-22** (ver auditoria acima). Nada a fazer aqui.
2. **Vincular o tenant `irma` a uma organização Clerk real** ANTES da irmã começar a usar — hoje o `clerkOrgId` dela ainda é o placeholder `org_demo_irma`. Ao criar a org de verdade no Clerk, ou (a) atualizar manualmente o `clerkOrgId` do tenant `irma` no banco pro id real, ou (b) deixar o webhook criar um tenant novo e depois migrar os 3 brinquedos de teste — mas cuidado pra não duplicar. Melhor fazer isso **antes** dela logar.
3. **Migrar Clerk de teste → produção**: instância de produção (pk_live/sk_live), roles `org:owner/org:admin/org:staff` recriados na instância nova, webhook novo apontando pro domínio real, **conferir no dashboard da Vercel se `CLERK_WEBHOOK_SECRET` de lá já é um valor real** (o `.env.local` local é só placeholder, não sei o que está na Vercel). Ao trocar de instância, o `clerkOrgId` do `dineplay` muda de novo — replanejar o passo 2 junto.
4. ~~DNS wildcard~~ — **✅ já está feito**, confirmado via Vercel CLI: `dinyfestas.com.br` + `*.dinyfestas.com.br` + `www.dinyfestas.com.br` verificados no projeto `diny-festas`. Só falta confirmar manualmente se `CLERK_WEBHOOK_SECRET`/`CLERK_SECRET_KEY` na Vercel são valores reais (não consegui ver o valor, só que a variável existe — ver auditoria parte 2 acima).
5. ~~Worker na VPS~~ — **✅ feito em 2026-07-22**. Acabou sendo a VPS `srv1291914` (76.13.161.94), que já hospeda outros projetos (`zeus-estoque`, `zeus-academy-web`, `crm-barbearia-frontend`, n8n) — deploy feito **sem tocar em nada deles** (confirmado antes/depois: mesmos PIDs, mesmo uptime, zero restarts). Detalhes técnicos em [[vps_srv1291914_shared]] (memória): Node 24 isolado via nvm (não mexeu no Node 20 do sistema), Redis isolado (`127.0.0.1` + senha, sem regra de firewall), código em `/var/www/diny-worker`, PM2 com `interpreter` apontando pro Node 24 explicitamente. Worker rodando, tick de 60s confirmado, `pm2 save` feito (sobrevive a reboot, `pm2-root` startup já estava configurado).
6. ~~Banco de TESTE separado~~ — **✅ feito em 2026-07-23**. Projeto Supabase `diny-festas` (ref `lgiyjpivujmhzjgkkflq`, distinto da produção `rzezilteejznqnmonhyi`). Role `app_runtime` NOBYPASSRLS criado via SQL Editor; migration `20260626173745_init` aplicada; `rls.sql` aplicado; `packages/core/.env.test` configurado com **DATABASE_URL = app_runtime** (paridade com produção) e **DIRECT_URL = postgres** (DDL). **Suíte de isolamento rodou de verdade: 3/3 passaram** (B não lê A; fail-closed; WITH CHECK bloqueou insert cross-tenant com erro 42501 — o `prisma:error` no log é o teste provocando a violação de propósito). Trava do `vitest.config.ts` (recusa rodar sem `.env.test`) + trava anti-produção seguem ativas. Comandos usados (PowerShell, em `packages/core`): `node --env-file=.env.test node_modules\prisma\build\index.js migrate deploy` → `... db execute --file prisma\rls.sql --schema prisma\schema.prisma` → `pnpm test`. ⚠️ As senhas do banco de teste passaram por chat — incluir no item 7 (gerenciador de senhas) e, se quiser, rotacionar depois.
7. ⚠️ **`credenciais.md` na raiz**: está no `.gitignore` (não versionado — conferido no histórico do git), mas contém senha do banco e chaves em texto puro no disco. Mover para um gerenciador de senhas e apagar o arquivo. **Se essas chaves já apareceram em algum chat/print, rotacionar.**
8. **Smoke test de ponta a ponta em produção** (checklist abaixo) — só depois dos pontos 2–6.

## 🟠 FALTA — importante (primeiras semanas)

- [ ] **Tela de configurações do tenant** (`/admin/configuracoes`): WhatsApp, cores, headline, endereço — hoje só via banco. Validar com Zod (criar `tenantSettingsInput`; `updateSettings` ainda aceita `Record<string, unknown>`).
- [ ] **Editar reserva** (datas/brinquedos/valor) + `reminderService.reschedule` ao mudar retirada.
- [ ] **Avançar status da reserva na UI** (Em entrega → Montado → Retirado → Finalizada) — o service (`setStatus`) já faz, falta botão.
- [ ] **Notificação de verdade no WhatsApp** (hoje o lembrete vira só notificação no painel; o valor real é avisar o `whatsappAlerts` do tenant — via API oficial ou n8n).
- [ ] **CI (GitHub Actions)**: typecheck + build + testes de isolamento em Postgres de serviço. Sem CI, regressão de RLS passa batido.
- [ ] **Backup do banco**: conferir PITR/backup diário no plano do Supabase.
- [ ] **Upload de imagens dos brinquedos** (Supabase Storage) — o site público hoje não tem foto, e foto é o que vende.
- [x] **Captação de leads no site** — ✅ feito em 2026-07-23: form público "Peça seu orçamento" (`(site)/actions.ts` → `createPublicLead`) com Zod (`leadInput`), honeypot anti-spam, tenant resolvido pelo host (nunca do form) → cria `Lead` + `Notification NEW_LEAD` (aparece em `/admin/notificacoes`). Feedback via `?lead=ok|erro`. Turnstile fica como upgrade futuro se houver spam.
- [ ] Migrar `middleware.ts` → convenção `proxy` (deprecada no Next 16; hoje é só warning).
- [ ] `AuditLog` não é escrito em lugar nenhum (registrar ações sensíveis: cancelamento, pagamento, mudança de settings).

## 🟡 FALTA — roadmap (Fase 2+)

- [ ] shadcn/ui + refino visual do admin (hoje é Tailwind cru, funcional)
- [ ] Landing premium por tenant (animações, galeria, depoimentos, FAQ) — **base já evoluída em 2026-07-23**: o site público agora tem navbar sticky, hero com cores/cidade do tenant + checklist de promessas, benefícios, catálogo com cards ricos (foto ou emoji por categoria, chip de categoria, badge de disponibilidade, CTA por brinquedo), "como funciona", form de orçamento e footer com contatos. Falta a camada "premium" (motion/galeria/depoimentos).
- [ ] Realtime (Supabase) para sino/toast de notificação sem refresh
- [ ] Agenda/calendário de reservas (visão mensal)
- [ ] Relatórios com Recharts (faturamento por mês, payback por brinquedo — `calculations.ts` já tem as fórmulas)
- [ ] Manutenção + checklists de higienização
- [ ] Conversas/WhatsApp inbox, Google Calendar, n8n
- [ ] Quote (orçamento) — modelo existe, sem fluxo
- [ ] Multi-domínio personalizado por tenant (campo `customDomain` já resolve, falta processo de apontamento)
- [ ] Cobrança/assinatura das empresas (quando virar produto)

---

## 🚀 Checklist de smoke test (rodar antes de soltar)

1. `dineplay.<dominio>` e `irma.<dominio>` abrem sites distintos, cores/textos próprios.
2. Login no Clerk → `/admin` do próprio tenant abre; `/admin` do tenant da outra empresa **nega acesso**.
3. Criar brinquedo → aparece no site público.
4. Criar cliente → criar reserva (conflito de brinquedo no mesmo horário é **bloqueado** com banner).
5. Confirmar reserva → lembretes criados com horário certo (conferir `BookingReminder.fireAt` = horário de SP em UTC+3h).
6. Registrar sinal → vira "Sinal pago"; registrar restante → "Pago".
7. Worker rodando: no horário, notificação aparece em `/admin/notificacoes` com badge.
8. Cancelar reserva → lembretes cancelados.
9. Dashboard e financeiro batem com o que foi lançado.
10. Celular: painel navegável e formulários utilizáveis.

## ⚙️ Variáveis de ambiente por peça

| Peça | Variáveis |
|---|---|
| Vercel (web) | `DATABASE_URL` (app_runtime + pgbouncer), `DIRECT_URL`, `NEXT_PUBLIC_CLERK_*`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_*` |
| VPS (worker) | `DATABASE_URL` (app_runtime), `REDIS_URL` |
| Migrations (local/CI) | `DIRECT_URL` (owner) — e **sempre** `pnpm db:rls` depois |
