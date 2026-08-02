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

> **Parcialmente resolvido em 01/08 — ver item 10.** O Multicanal foi revisado nó
> a nó e o export foi atualizado. O que o export novo desmente deste item:
> a tool `meus_agendamentos` **existe** e está ligada ao AI Agent; o `bookingId`
> **está** no payload do `agente_agenda`; a descrição da tool **já ensina**
> `reagendar` e `cancelar`; o `Filtro: bot liberado?` já usa `canReply`; os 12 nós
> mortos já foram apagados. O diagnóstico do `Escolher modelo` também mudou de
> causa (não é mais a ordem). O que continua valendo está reescrito no item 10.

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

**Confirmado por fora do n8n (verificado 31/07):** o JSON exportado em
`docs/workflows/Diny Festas-Agenda.json` e `Diny Festas-Multicanal.json` bate
com o diagnóstico acima — zero menção a `cancelar`/`reagendar` na descrição da
tool, no `Switch_Tools` (só tem os 4 branches antigos: `horarios_disponiveis`,
`realizar_agendamento`, `registrar_interesse`, `solicitar_cancelamento`, com
fallback mudo — toolName desconhecido não gera erro nem resposta, só some) ou
no payload do `agente_agenda`. Ou seja, hoje a IA não tem NENHUM caminho para
reagendar ou cancelar — ela nem sabe que essas operações existem. Isso é mais
grave que "falta publicar em produção" (item 2): mesmo com o deploy feito, a
IA não chamaria essas rotas.

**Cuidado ao usar os exports de `docs/workflows/` como referência:** os 3
arquivos são de **26/07**, 5 dias antes desta revisão (31/07). Não têm o nó
`Escolher modelo`/`modelRoute`, os 12 nós mortos, nem os 8 campos soltos no
payload que este item descreve — sinal de que o canvas do n8n foi editado ao
vivo depois do dia 26 e nunca foi reexportado. Reexporte do n8n antes de usar
esses arquivos pra conferir o que já foi limpo ou não.

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

## 5. Testes de integração — rodam e passam onde `.env.test` existe (verificado 31/07)

`packages/core/.env.test` é gitignored — por isso é por MÁQUINA, não pelo repo.
Nesta máquina o arquivo já existe (criado 23/07, aponta pra um projeto Supabase
de teste com ref diferente do de produção — conferido antes de rodar). Rodando
`pnpm --filter @diny/core test` agora: **56/56 passando**, 7 arquivos.

Isso inclui os 6 de agenda que este item dizia estarem testados "só no papel" —
todos passando de verdade, com banco e RLS reais (`app_runtime`, sem bypass):
reagenda por `bookingId` sem tocar em brinquedo/preço/cliente, rejeita telefone
errado ou horário ocupado, recusa horário no passado, cancela de forma
idempotente, avisa a equipe quando a IA cancela, recusa cancelar com pagamento
já registrado. Mais isolamento RLS (3), remoção de reserva cancelada (4),
diretório de clientes (5) e os 26 puros (schemas/availability/text) de sempre.

Numa máquina nova (ou se um dia existir CI): `pnpm test` continua recusando
rodar sem esse arquivo, de propósito — copie `.env.test.example` e aponte pra
um banco de TESTE antes de rodar (já houve um episódio de teste batendo em
produção; é por isso que o gate existe).

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

## 8. Pequena inconsistência: guard de tags de etapa só existe no Funil

`toggleTagFromFunilAction` ([`admin/funil/actions.ts`](apps/web/src/app/admin/funil/actions.ts))
recusa mexer em tags controladas pelo funil (`STAGE_ONLY_TAGS`: `agendado`,
`novo-lead`) antes de chamar `conversationService.toggleTag`.
`toggleTagAction` ([`admin/conversas/actions.ts`](apps/web/src/app/admin/conversas/actions.ts))
chama o mesmo `toggleTag` sem esse guard.

Não dá pra explorar pela UI — o catálogo de checkboxes (`TAG_CATALOG` em
`lib/tags.ts`) já exclui as duas tags —, mas as duas server actions fazem a
mesma operação com validação diferente. Se `toggleTagAction` for chamado com
tag `"agendado"`, ela vira uma tag solta no array sem mover `stage` (só
`atendimento-humano` e `pos-festa` são tratadas especialmente dentro de
`toggleTag`). Baixo risco (exige chamar a action fora da UI, mesmo tenant),
mas vale igualar o guard nos dois lugares.

---

## 9. Fragilidade: `toyName` vazio + `toys` com mais de um nome quebra a checagem de disponibilidade

Em `normalizar_disponibilidade` (subworkflow Agenda, nó de código antes de
`consultar_disponibilidade`), quando a IA não preenche `toyName` e manda só
`toys`, o código faz `Array.isArray(p.toys) ? p.toys[0] : p.toys` — mas
`toys` chega sempre como STRING (o n8n converte tudo pra string na borda do
subworkflow), nunca como array. Se a IA mandar `toys: "pula-pula,
escorregador"` sem preencher `toyName`, o valor vira o nome a consultar por
INTEIRO, vírgula e tudo — não bate com nenhum brinquedo real, e a resposta
é "nada disponível" mesmo havendo vaga de verdade.

O system prompt já instrui a IA a checar "um de cada vez" e usar um nome só,
o que evita isso na prática — é uma fragilidade que depende do modelo seguir
essa instrução, não um bug que dispara sempre. Correção simples (dividir
`toys` por vírgula e pegar o primeiro), mas fica registrada.

---

## 10. n8n — migração de credenciais e correção do Multicanal (01/08/2026)

Sessão dedicada a tirar os segredos de texto puro dos nós e revisar o Multicanal
nó a nó. O checklist detalhado, com o propósito de cada nó, está em
`docs/workflows/AJUSTES-MULTICANAL.md` (não versionado).

### Concluído

**Credenciais criadas no n8n** (substituem o segredo repetido em ~21 nós dos 3
workflows). Credencial no n8n é da instância inteira, então serve nos três:

- `Evolution API Key` (Header Auth, `apikey`) — chamadas à API do Evolution
  (`Baixar Áudio Evolution`, `Baixar Mídia Evolution`). Antes um nó usava o
  `apikey` vindo no PRÓPRIO payload de entrada (não confiável) e o outro tinha o
  valor fixo colado.
- `Diny Agent Secret` (Header Auth, `x-diny-secret`) — rotas `/api/agent/*` que
  autenticam por header.
- `Diny Agent Token (Query)` (Query Auth, `token`) — rotas que autenticam **só**
  por query string: `/api/whatsapp/send`, `/api/whatsapp/log-inbound` e
  `/api/agent/status`.

**Correções aplicadas no Multicanal:**

- Novo `Filtro: fromMe/grupo?` logo após o webhook — descarta eco da própria
  empresa e mensagem de grupo ANTES de gastar Whisper/Vision (custo de API real,
  não só token). O `Filtro: mensagem válida?` seguiu como rede de segurança.
- `Filtro: bot liberado?` movido para ANTES de `tem tag pos-festa?`. Fecha a
  brecha em que `desligar-ia` + `pos-festa` juntas faziam a conversa escapar da
  checagem de silêncio e cair no subworkflow Pós-festa. Agora `canReply` é
  checado uma vez só, e tudo depois herda a garantia. (Resolve também o item
  "`Filtro: bot liberado?` ignora o `botPaused`" do item 3 — a condição agora é
  a expressão única `{{ $('buscar_tags').item.json.canReply }}`.)
- `Espelhar no inbox` **apontava para `/api/whatsapp/send`** em vez de
  `/api/whatsapp/log-inbound`: em vez de só registrar a mensagem no CRM, estava
  **enviando de volta ao cliente** a transcrição/descrição da própria mensagem
  dele. Descoberto em teste manual. Sem impacto real — número ainda não
  divulgado, workflow fora de produção.
- `suporte_humano` com URL malformada (`$('resolver_tenant').item`, sem
  `.json.apiBase` → `[object Object]/api/agent/suporte`).
- Corpo JSON de `toolHttpRequest` no formato errado. O campo espera uma **string
  JSON**; a expressão retornava um **objeto JavaScript**, que virava o texto
  `[object Object]`. Formato correto é o template com interpolação
  (`{ "phone": "{{ ... }}" }`), com `JSON.stringify` nos campos vindos de
  `$fromAI` (o texto é gerado pela IA e pode ter aspas/quebra de linha).
- `Juntar e Formatar (chatInput)` — `return` enxugado para `{ chatInput }` (antes
  espalhava a resposta crua da OpenAI/Whisper para todos os nós seguintes).
- Nó Whisper renomeado de `HTTP Request` para `Whisper`, com a referência dentro
  do código de `Juntar e Formatar` atualizada junto (o n8n não refatora
  referência escrita dentro de Code node).

**Incidente diagnosticado (01/08, 01:33–01:34):** em conversa de teste real, a IA
decidiu corretamente escalar para humano e mandou a mensagem padrão de transbordo
**duas vezes**, mas a tag `atendimento-humano` nunca foi aplicada. Causa: a tool
`suporte_humano` estava quebrada (URL inválida + corpo `[object Object]`), e o
próprio system prompt manda reacionar `suporte_humano` quando uma ferramenta
falha — gerando o loop. **Não era erro de julgamento da IA.** Fica o aprendizado:
"a IA não acionou a tag" pode ser ferramenta quebrada, não prompt ruim.

**Backend verificado — não era problema da API.** Testado contra
`/api/agent/suporte` com corpo inválido de propósito (o Zod rejeita antes de
qualquer escrita, sem efeito colateral): com o header → `400 dados inválidos`
(auth ok, rota executa); sem o header → `401`. DNS, middleware, credencial e
rota todos corretos.

**Export do Multicanal atualizado** (`docs/workflows/Diny Festas-Multicanal.json`,
01/08 01:26) — reflete o canvas ao vivo, 56 nós. Resolve o aviso do item 3 sobre
usar exports de 26/07 como referência, mas **só para o Multicanal**: `Agenda`
(31/07 22:04) e `PosConsulta` (26/07) continuam defasados.

**Respondido:** o mecanismo de debounce via Redis continua existindo e intacto
depois do `Mapear dados` (10 nós implementando "last message wins"). Não foi
substituído por nada.

### 🔴 Bug do n8n: `toolHttpRequest` sem método `execute` (resolvido com patch temporário)

**Sintoma:** toda chamada das tools `suporte_humano` e `notas` falhava em ~1ms com
`The node "@n8n/n8n-nodes-langchain.toolHttpRequest" has a "supplyData" method but
no "execute" method.` — sem nenhuma requisição HTTP sair. A IA decidia certo
(mandava a mensagem de transbordo do prompt), mas a tag nunca era aplicada, e o
próprio prompt manda reacionar `suporte_humano` quando uma ferramenta falha,
gerando mensagens repetidas ao cliente.

**Causa raiz (confirmada no código do container, n8n 2.31.7):** todo nó de
ferramenta tem `supplyData` **e** `execute` — exceto o `ToolHttpRequest`:

```
ToolCalculator/ToolCode/ToolSearXng/ToolSerpApi/ToolThink/
ToolVectorStore/ToolWikipedia/ToolWolframAlpha   supplyData=1 execute=1  OK
ToolWorkflow v2 (usado pelo agente_agenda)       supplyData=1 execute=1  OK
ToolHttpRequest                                  supplyData=1 execute=0  <-- BUG
ToolWorkflow v1                                  supplyData=1 execute=0  <-- idem
```

O `AI Agent` v3.1 registra cada chamada de ferramenta como execução de nó real
(por isso aparecem no log com input/output). Esse caminho passa por `runNode`
(`n8n-core/dist/execution-engine/workflow-execute.js:987`), que faz:

```js
if (nodeType.execute || customOperation) { ...roda... }
if (nodeType.poll) { ... }  if (nodeType.trigger) { ... }
if (nodeType.supplyData) { throw "has a supplyData method but no execute method"; }  // linha 735
```

O `execute` dos outros tools é justamente o shim que os faz sobreviver a isso.
Confirmado em execução **de produção** (webhook), execução `82440` — não era
artefato do botão de teste do nó.

**Descartado por teste antes de chegar aqui:** credencial vs. header hardcoded ·
formato do corpo JSON · `.item` vs `.first()` · Placeholder Definitions vs
`$fromAI` inline · `$('nó')` dentro de Code node · nó `Espera 15s (debounce)` ·
restart do n8n · backend (testado ao vivo: 400 com auth válida + corpo inválido,
401 sem header — rota íntegra).

**Correção aplicada (01/08) — PATCH TEMPORÁRIO no container:** adicionado o
método `execute` faltante em
`/usr/local/lib/node_modules/n8n/node_modules/@n8n/n8n-nodes-langchain/dist/nodes/tools/ToolHttpRequest/ToolHttpRequest.node.js`,
seguindo o mesmo padrão do `ToolCode`/`ToolThink`. Ele reaproveita o `supplyData`
existente e envolve o contexto num `Proxy` que fornece `addInputData` e
`addOutputData` como no-op — os dois únicos métodos de sub-nó que a função
interna da ferramenta usa e que não existem no contexto de execução
(`addInputData` precisa devolver `{ index }`; `addOutputData` tem retorno
descartado com `void`). Sintaxe validada com `node --check` antes de aplicar.
Resultado do teste: `{"ok": true, "message": "Um atendente humano foi avisado..."}`.

> ⚠️ **O patch é volátil.** Ele vive dentro do container e **desaparece quando a
> imagem do n8n for atualizada ou o container for recriado** (sobrevive a
> `docker restart`). Backup do arquivo original em `/tmp/ToolHttpRequest.node.js.ORIG`
> na VPS — mas `/tmp` também é limpo em boot. **Guarde uma cópia fora da VPS.**
>
> Reverter: `docker cp /tmp/ToolHttpRequest.node.js.ORIG n8n:<caminho> && docker restart n8n`

**Solução definitiva (a fazer):** converter `suporte_humano` e `notas` para
`toolWorkflow` **v2.2** (o formato do `agente_agenda`, que tem `execute` e nunca
quebrou). Cada um vira um subworkflow com trigger "When Executed by Another
Workflow" + um HTTP Request normal. Aí o patch deixa de ser necessário e o
sistema fica imune à próxima atualização do n8n. ⚠️ Ao criar, garanta a **v2.2** —
a v1 tem o mesmo defeito.

### Concluído na rodada de 01/08 (tarde)

Conferido ao vivo no banco do n8n. O passo a passo completo está em
`docs/workflows/PLANO-AJUSTES.md`.

- **`agente_agenda` → `toolName`** — aceitava `solicitar_cancelamento`, que **não
  existe** no `Switch_Tools` do Agenda (que espera `cancelar`), e não mencionava
  `reagendar`. Com `fallbackOutput: none`, a chamada sumia em silêncio. **Era a
  causa real de cancelar/reagendar nunca terem funcionado** — mais concreta que o
  diagnóstico do item 3, que atribuía à ausência da tool e do `bookingId` (ambos
  já existiam).
- **`Switch_Tools` com fallback** + nó `retorno_toolname_invalido` devolvendo
  `ok:false` e a lista de operações válidas. Fecha a classe inteira de "chamada
  some sem rastro".
- **Agenda migrado para credencial** — os 8 nós HTTP, 0 segredo em texto puro.
  ⚠️ No import o n8n renomeou todos os nós com sufixo `1`; verificado que **nenhuma
  referência quebrou** (ele atualizou as expressões junto). Não renomear de volta
  na mão — Code node não atualiza referência sozinho.
- **`normalizar_disponibilidade`** — split de `toys` por vírgula (resolve o item 9).
- **`notas`** — Placeholder Definitions preenchido.
- **System prompt otimizado** — 14.489 → 7.906 caracteres (~4.025 → ~2.160 tokens,
  −46%). Maior corte: a seção que descrevia as ferramentas era **duplicação pura**,
  porque o n8n já injeta as descrições delas automaticamente. Como o agente reenvia
  o prompt a cada iteração do loop, uma mensagem com 2 tool calls economiza ~5.600
  tokens. Medição confirmada em execução real: 2.905 tokens totais, dos quais só
  **~220 são o contexto da conversa** — o compactador está espremendo 80 mensagens
  nisso. Versão em `docs/workflows/PROMPT-OTIMIZADO.txt`.
- **`Escolher modelo`** — todos os ramos terminavam em `gpt4o-mini`, então
  `openai-strong` nunca era produzido e o modelo forte ficava conectado e morto.
  Casos emocionais e complexos passam a usar `gpt-4.1-mini`. Confirmado em execução
  real.
- **Transbordo silencioso corrigido** (`apps/web/src/app/api/agent/suporte/route.ts`):
  a tool aplicava a tag e pausava o bot, e aí `/api/whatsapp/send` — que respeita o
  handoff — devolvia `{skipped}` e **a mensagem avisando o cliente nunca era
  enviada**. O aviso passou a sair da própria rota de escalonamento, antes da pausa,
  com guarda para não repetir em reescalonamento e `try/catch` para que falha de
  envio não impeça a equipe de ser avisada. A guarda de `/api/whatsapp/send`
  continua intacta. `tsc --noEmit` verde. **Aguarda deploy.**

### Rodada de 01/08 (noite) — otimização de contexto e bugs do agendamento

**Bug crítico encontrado — nenhuma reserva conseguia fechar.** O
`normalizar_agendamento1` (Agenda) lê `currentCustomerMessage` para detectar o
"sim" do cliente, mas esse campo **não é declarado no trigger nem enviado pelo
`agente_agenda`**. `explicitConfirmation` era sempre `false`, então `faltando`
sempre continha "confirmação explícita do resumo" e a IA repetia o resumo em
laço. Junto: o normalizador só lia `toys`, e a IA preenchia `toyName`. Correção
documentada em `docs/workflows/PLANO-AJUSTES.md` (3 pontos).
**Nó para inspecionar se reaparecer:** `normalizar_agendamento1` → array `faltando`.

**Pacotes fixos removidos.** `formatar_disponibilidade1` enumerava
`PERIODOS = [4, 7]`, contradizendo o próprio validador do workflow — que já aceita
qualquer duração ≥ 4h em blocos de 30 min, sem teto. Novo formatador devolve os
blocos livres com `ultimaMontagem` e `duracaoMaximaHoras`, e descarta blocos
menores que o mínimo.

**Regra de preço definida:** mínimo **R$ 150,00 por 4 horas**, comunicável como "a
partir de". Acima disso, `base_conhecimento`; se não cobrir, `suporte_humano`.
Proibido calcular proporção. Bate com o `minRentalPrice` default `150` do
`quoteWithMinimum`.

**Mitigação de bootstrap poisoning (padrão de mercado).** A nota gravada por
`/api/agent/suporte` voltava no topo do contexto a cada mensagem, e o modelo a lia
como pedido atual — escalava, regravava a nota, escalava de novo. A literatura de
segurança de agentes chama isso de *bootstrap poisoning*: a saída do próprio
agente realimentada como contexto confiável. A mitigação recomendada é manter
escritas de memória "escopadas, inspecionáveis e invalidáveis" — implementado
amarrando a nota ao ciclo de vida da tag `atendimento-humano`: some do contexto
quando a equipe devolve a conversa, mas continua visível no CRM.

**Prompt caching destravado.** O bloco `## Dados temporais` estava no TOPO do
system message, com `Agora: HH:mm` mudando a cada minuto. Como o cache da OpenAI
funciona por prefixo comum, **nada cacheava**. Movido para o final (97% do
prompt): os ~2.700 tokens iniciais viram prefixo estável, elegível a 50% de
desconto — multiplicado por cada iteração do loop do agente.

**Personalidade ajustada.** O prompt dizia "clima de festa infantil", o que
empurrava a IA a falar de forma infantilizada com quem contrata. Nova seção
`# COM QUEM VOCÊ FALA`: a festa é da criança, mas o interlocutor é adulto
(mãe/pai/avó) organizando com pressa e orçamento em mente.

**Confirmado sem alterar:** o preço na reserva já funciona como desejado — a IA
nunca envia valor (`agentBookingInput` não tem o campo), o backend calcula um
default, e `/admin/reservas/[id]` permite editar `total`, horários, brinquedos e
endereço. O `bookingService.update` **já recalibra os lembretes** ao mudar
horário, o que resolve a pendência do `CLAUDE.md` sobre "editar reserva sem tela".
⚠️ Fica registrado que o total **não depende da duração** (4h e 14h nascem com o
mesmo valor) — sem impacto de cobrança porque é ajustado no painel, mas o
financeiro só reflete o combinado depois da edição.

**Filtro de expediente na disponibilidade** (`apps/web/.../api/agent/disponibilidade`):
a grade crua vai de 00:00 a 24:00 e a IA oferecia montagem de madrugada. Agora
recorta pelo `TenantSettings.businessHours`, reaproveitando o `parseBusinessHours`
que o painel já usa (exportado do `core`, função intocada). **Só restringe quando
o tenant configurou** — hoje está `null`, e usar o default `08:00–18:00`
esconderia disponibilidade real. Sem filtro de dia da semana: o dono atende os 7
dias, e o default do código é seg–sáb. `tsc` verde nos dois pacotes, **56/56
testes passando**. ⚠️ Enquanto `/admin/configuracoes` não tiver o horário
preenchido, o filtro não age.

### Pendente
- **Runner JavaScript instável (problema separado, não investigado a fundo).**
  Nos logs do n8n, **23 ocorrências em 12h** de
  `No matching task offer for request "..." (type "javascript"). Available offer
  types: [python]`. O runner JS morre por idle timeout e re-registra num ciclo;
  quando um Code node JS roda nesse intervalo, não há runner disponível. Afeta
  `Extrair dados`, `Juntar e Formatar`, `Escolher modelo` e `meus agendamentos`,
  que são JS. Config atual: `N8N_RUNNERS_MODE=external` +
  `N8N_NATIVE_PYTHON_RUNNER=true` (o runner python fica sempre de pé, o JS não).
- **`meus_agendamentos` com o segredo duplicado** — ganhou a credencial mas o
  header `x-diny-secret` hardcoded continua nos Header Parameters do nó.
- **`Escolher modelo` nunca produz `openai-strong`.** Corrige o diagnóstico do
  item 3: o problema não era (só) a ordem dos nós — hoje o nó já roda depois do
  `Preparar compactacao`, mas **todos** os ramos do `if/else if` terminam em
  `modelRoute = 'gpt4o-mini'`, inclusive os que detectam caso emocional,
  complexo ou áudio longo. O `Model Selector` tem uma regra esperando
  `'openai-strong'`, valor que não é produzido em lugar nenhum. Resultado: o nó
  `Strong` está conectado mas nunca é usado, e toda a classificação roda e é
  descartada. Impacto: reclamação/insatisfação — caso de transbordo obrigatório
  — é classificada como "exige empatia" e ainda assim vai para o modelo fraco.
  Durante a edição a Rule 2 do `Model Selector` foi apagada e o `Strong`
  desconectou; ambos precisam ser restaurados junto com a correção do código.
- **Subworkflow Agenda não revisado após a migração.** Os 8 nós
  (`consultar_disponibilidade`, `criar_reserva`, `escalar_suporte_humano`,
  `registrar_interesse_lead`, `buscar_reserva_alvo`, `cancelar_reserva`,
  `escalar_cancelamento`, `reagendar_reserva`) foram migrados para credencial mas
  o export é anterior a isso. A mensagem da IA no incidente citava "probleminha
  técnico **ao finalizar o agendamento**", o que sugere uma segunda falha dentro
  do Agenda. Reexportar e varrer.
- **PosConsulta não revisado** — 6 nós usando o segredo, export de 26/07.
- **Padrão `.item` vs `.first()` em nó tool.** `$('nó').item` depende do *item
  linking* do n8n; num nó tool, quem executa é o AI Agent, fora da linhagem
  normal de itens, e o valor pode vir vazio. `.first()` não depende disso.
  `notas` ainda usa `.item`. (`agente_agenda` já usava `.first()`.)
- **Webhook não valida a origem.** `Webhook - Mensagem Recebida` está com
  Authentication: None e nada confere o `body.apikey` que o Evolution manda.
  Quem descobrir a URL pode forjar mensagem. Solução acordada: checar
  `body.apikey` no `Filtro: fromMe/grupo?` e descartar em silêncio. Confirmado
  com o usuário que os tenants compartilham o mesmo servidor Evolution (instância
  diferente por tenant), então o apikey global serve para todos — mas **se um dia
  um tenant ganhar servidor Evolution próprio, esse check precisa virar lista.**
- **`não suportado` é um beco sem saída.** Figurinha, documento, localização,
  contato, enquete e reação caem num NoOp sem resposta — do ponto de vista do
  cliente é indistinguível de "o bot não respondeu". Precisa de resposta padrão
  (e o system prompt precisa saber do novo marcador).
- **Retenção de execução guarda tudo.** `saveDataSuccessExecution` e
  `saveDataErrorExecution` em `"all"` gravam o payload inteiro de cada execução,
  sem expiração. Decisão de política, não urgente enquanto o acesso ao n8n for
  restrito.
- **Limpeza:** `Memória (Redis)` está **desabilitada e desconectada** do AI Agent
  (o agente roda sem memória do LangChain — confirmar se foi decisão, já que o
  `contexto CRM` busca `limit: 80` do histórico); nó `Redis` órfão sem entrada
  nem saída; `compactar memory` desabilitado e órfão. Os outros 12 nós mortos que
  o item 3 lista **já foram limpos**.
- **Atalho sem IA a revisar:** `reservas existentes` (true) → `meus_agendamentos`
  → `meus agendamentos` (code) → `Separa em bolhas` responde ao cliente **sem
  passar pelo AI Agent**. Parece otimização proposital (pergunta com resposta
  determinística), mas falta conferir se a condição não engole pergunta que
  precisaria da IA.
- **Código:** a checagem de `AGENT_API_SECRET` está duplicada rota por rota, sem
  função compartilhada, e inconsistente — algumas rotas só header, algumas só
  query, `/api/agent/tenant` aceita as duas. Foi o que causou os 401 durante a
  migração. Não foi mexido (fora do escopo da tarefa do n8n).

---

## Fora de escopo, anotado

- O worker (`apps/worker`) roda só o tick de lembretes a cada 60s. O agente saiu
  dele quando migrou para o n8n.
- Os exports dos workflows do n8n ficam em `docs/*.json` e **não são versionados**
  (têm `AGENT_API_SECRET` e a apikey do Evolution em texto puro). Leve-os à mão
  entre máquinas, ou reexporte do n8n.
