# Pendências

Levantado em 31/07/2026. Ordenado por urgência.

---

## 1. WhatsApp desconectado — nada chega no CRM

**Sintoma:** a última mensagem gravada é de **29/07 às 18:26** (horário de SP).
Reconectar o QR não gerou entrada nova.

**Já verificado e descartado:**

- A API está saudável: `canReply: true`, `botPaused: false`, sem tags de bloqueio.
- A instância resolve: `GET /api/agent/tenant?instance=diny-festas` → 200.
- O Evolution está no ar (403 sem o `x-diny-proxy`, que é o comportamento esperado do nginx).
- Reconectar pelo painel **não** apaga webhook: `ensureInstance` sai fora se a
  instância já existe.

**Suspeito principal:** a instância do Evolution está sem webhook configurado.
`ensureInstance(instance)` é chamado **sem `webhookUrl`** em
[`admin/configuracoes/actions.ts`](apps/web/src/app/admin/configuracoes/actions.ts) — e
[`lib/evolution.ts`](apps/web/src/lib/evolution.ts) só monta o bloco `webhook` se
receber uma URL. Ou seja: se a instância foi recriada em algum momento, ela
nasceu sem webhook, e o botão de reconectar nunca conserta isso.

**Como confirmar (precisa de acesso ao Evolution):**

```
GET /webhook/find/diny-festas          → existe? enabled? aponta pra onde?
GET /instance/connectionState/diny-festas   → precisa ser "open"
```

E no n8n: o workflow **Multicanal** está *Active*? Se estiver desativado, só a
URL de teste responde e o Evolution desiste em silêncio.

**Correção sugerida no código:** passar a URL do webhook para o `ensureInstance`,
para que reconectar volte a ser suficiente em vez de depender de configuração
manual.

---

## 2. Deploy pendente

O `main` já tem as rotas novas, mas **produção ainda não**. Confirmado por
requisição: `/api/agent/cancelar` e `/api/agent/reagendar` respondem **404**.

Falta publicar:

- `POST /api/agent/cancelar`
- `POST /api/agent/reagendar`
- `slotMinutes: 30` em `/api/agent/disponibilidade`
- `bookingId` e os rótulos `HH:mm` em `/api/agent/meus-agendamentos`

Enquanto não subir, os ramos de cancelar/reagendar do n8n falham fechado e
escalam tudo para a equipe — comportamento seguro, mas nada automático.

> A pasta `.vercel` sumiu junto com a cópia antiga. Rode `vercel link` antes do
> primeiro deploy manual, ou deixe a integração do GitHub publicar sozinha.

---

## 3. n8n — workflow Multicanal

O subworkflow **Agenda** já está revisado e correto (conferido nó a nó em
31/07). O **Multicanal** ainda não foi mexido.

### Bloqueiam cancelar/reagendar

- **Falta a tool `meus_agendamentos`** no `AI Agent`. Sem ela a IA nunca obtém o
  `bookingId`, e os dois ramos novos ficam inalcançáveis.
  `toolHttpRequest` → `POST {apiBase}/api/agent/meus-agendamentos`, body
  `{ "phone": "..." }`.
- **Falta `bookingId` no payload do `agente_agenda`:**
  ```
  {{ $fromAI('bookingId', 'UUID da reserva, exatamente como veio da ferramenta meus_agendamentos.', 'string', '') }}
  ```
- **A descrição da tool não ensina `cancelar` nem `reagendar`.** O `Switch_Tools`
  espera esses dois `toolName`; a descrição ainda fala de `solicitar_cancelamento`,
  que não é mais uma saída. A IA manda um nome que cai no fallback e nada acontece.

### Qualidade e limpeza

- **`Escolher modelo` está na ordem errada.** Roda antes do `contexto CRM`; o
  HTTP substitui o item e o `modelRoute` é descartado. Resultado: sempre
  `gpt4o-mini`, o modelo `Strong` nunca é escolhido. Mover para **depois** do
  `Preparar compactacao`.
- **12 nós para apagar:** `AI Agent2`, `OpenAI Model1`, `Memória (Redis)1`,
  `suporte_humano1`, `base_conhecimento1`, `agente_agenda1`, `notas1`,
  `v4 flash`, `V4 pro`, `compactar memory` (todos desabilitados), mais o nó
  `Redis` órfão e ativo, e a `Memória (Redis)` que está ligada a nada.
- **`Filtro: bot liberado?` ignora o `botPaused`.** Reimplementa só as duas tags
  na mão. Trocar as duas condições por `{{ $('buscar_tags').item.json.canReply }}`,
  que a API já calcula.
- **8 campos mortos no payload do `agente_agenda`** (nenhum é lido pelo Agenda
  novo): `pickupTime`, `customerContext`, `explicitTimes`, `explicitDurations`,
  `today`, `tomorrow`, `explicitConfirmation`, `explicitCancellation`. Custam
  zero token — só sujeira. O `today` está com a expressão errada (aponta para
  `explicitConfirmation`).

### Sobre reduzir tokens

Medição do que entra no modelo por mensagem respondida:

| | tokens | fatia |
|---|---:|---:|
| `systemMessage` | ~3.281 | 81% |
| Descrição das tools | ~511 | 13% |
| **Contexto compactado** | **~231** | **6%** |

O compactador já está ótimo (81 mensagens → 921 caracteres). O peso está no
prompt de sistema: a seção `# AGENDAMENTO — ORDEM OBRIGATÓRIA` sozinha custa
~665 tokens e hoje é em boa parte redundante — os normalizadores do Agenda já
recusam chamada incompleta e devolvem a lista `faltando`. Cortar essa seção pela
metade é o maior ganho disponível, e não custa nada em qualidade de contexto.

---

## 4. Google Calendar nunca sincroniza

`Booking.googleCalendarEventId` existe no schema mas **nada em lugar nenhum do
código escreve nesse campo**. Logo, `calendarEventId` nas respostas de reagendar
e cancelar vem sempre `null`.

Na prática: reagendar deixa um evento órfão no horário antigo, e cancelar não
apaga o evento. Precisa de decisão — ou o n8n grava o id de volta (exigiria um
endpoint novo), ou procura o evento por data/título.

---

## 5. Testes de integração não rodam

Falta `packages/core/.env.test`. O `vitest.config.ts` recusa rodar sem ele, de
propósito (já houve um episódio de teste batendo em produção).

Sem isso, **os testes de banco nunca foram executados** — incluindo os 6 de
agenda (reagendar, cancelar idempotente, aviso à equipe, recusa por pagamento,
recusa de data passada, conflito). A lógica de lock, conflito e idempotência
está testada só no papel.

Os 26 testes puros (schemas, availability, text) rodam e passam.

---

## 6. Middleware redireciona `/api` do domínio raiz

[`middleware.ts`](apps/web/src/middleware.ts) manda o domínio raiz para o tenant
primário (`dinyplay`), e o matcher pega `/api/*` junto:

```
dinyfestas.com.br      → 308 → www.dinyfestas.com.br
www.dinyfestas.com.br  → 307 → dinyplay.dinyfestas.com.br
```

Dois problemas:

1. Contraria o contrato escrito em `/api/agent/tenant`, que diz explicitamente
   que pode ser chamada no domínio raiz.
2. Mais grave: **qualquer rota de agente chamada no domínio raiz cai
   silenciosamente no tenant `dinyplay`**, em vez de falhar. Com um cliente é
   invisível; com dois, mensagem de uma empresa entra no inbox da outra.

Correção: excluir `/api` do redirect.

```ts
const isApi = req.nextUrl.pathname.startsWith("/api");
if (!isApi && (hostname === ROOT || hostname === `www.${ROOT}`)) { ... }
```

---

## 7. Armadilha: nome da instância ≠ slug

O tenant tem slug **`dinyplay`**, mas `TenantSettings.evolutionInstance` está
gravado como **`diny-festas`**. Funciona — `/api/agent/tenant` resolve pela
instância — mas se alguém "corrigir" esse campo para bater com o slug, o
`resolver_tenant` do n8n quebra na hora e o workflow inteiro para na terceira
caixa.

---

## Fora de escopo, anotado

- O worker (`apps/worker`) roda só o tick de lembretes a cada 60s. O agente saiu
  dele quando migrou para o n8n.
- Os exports dos workflows do n8n ficam em `docs/*.json` e **não são versionados**
  (têm `AGENT_API_SECRET` e a apikey do Evolution em texto puro). Leve-os à mão
  entre máquinas, ou reexporte do n8n.
