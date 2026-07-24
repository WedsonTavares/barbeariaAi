# Agente de IA no WhatsApp (atendimento + lead) via n8n

O n8n só faz o **relay** — recebe, chama nosso endpoint, manda a resposta quando ela sair. Toda a inteligência (OpenAI + catálogo/disponibilidade real) mora no nosso backend. **Nada aqui toca no zeus-estoque nem em qualquer outro app da VPS.**

**Precisa de DOIS workflows no n8n** (são fluxos independentes, na direção oposta):
1. **Entrada** (mensagem chega): [`n8n-agente-ia-workflow.json`](./n8n-agente-ia-workflow.json) — importe esse arquivo.
2. **Saída** (resposta sai): reaproveita o **mesmo workflow de saída dos lembretes** (ver [`N8N-LEMBRETES.md`](./N8N-LEMBRETES.md)) — se você já configurou os lembretes no WhatsApp, a resposta do agente sai por ali também, sem precisar configurar de novo.

## Por que dois fluxos, e por que a resposta não sai na hora

O agente espera **~8 segundos de silêncio** antes de responder — se o cliente manda "oi", depois "queria saber", depois "vcs tem pula-pula pro dia 15?" em sequência rápida, ele agrupa as três numa resposta só, em vez de responder cada uma separado (o que ficaria estranho e gastaria 3x mais). Por isso a chamada de entrada **não espera a IA** — ela só guarda a mensagem e responde rápido pro n8n. A resposta de verdade sai depois, de forma independente, pelo workflow de saída.

## Como funciona

```
Cliente manda "oi", "queria saber", "tem pula-pula dia 15?" (3 mensagens em 5s)
        ↓ (cada uma dispara o workflow de ENTRADA)
n8n: extrai { phone, message } → POST /api/agent/mensagem → só GUARDA, responde rápido
        ↓
   ... 8s de silêncio do cliente ...
        ↓
Nosso worker (VPS, a cada 10s) detecta a conversa parada → combina as 3 mensagens →
roda a IA (catálogo real, disponibilidade real, cria Lead se for o caso) → gera 1 resposta
        ↓
Worker chama o webhook de SAÍDA do n8n (o mesmo dos lembretes):
  { "event": "agent_reply", "toPhone": "...", "message": "..." }
        ↓
n8n: manda a mensagem pro cliente no WhatsApp
```

Tempo até a resposta chegar: entre 8 e 18 segundos depois da última mensagem do cliente (depende de onde caiu no ciclo de 10s do worker) — dá a sensação de "digitando..." natural, não instantâneo, mas nunca mais que ~20s.

## O que a IA NUNCA faz (por design)
- Não confirma reserva, não processa pagamento, não trava brinquedo.
- Não inventa preço fora do catálogo nem disponibilidade sem checar.
- Não sai do assunto (brinquedos/preços/agendamento desta empresa).
- Tem limite de 15 mensagens/hora por telefone (rate limit) — depois disso, novas mensagens são recusadas até a janela liberar.

## Passo a passo no n8n (~10 min no total)

**Fluxo de entrada:**
1. **Workflows → Import from File** → `docs/n8n-agente-ia-workflow.json`.
2. Abra o node **Webhook - Mensagem Recebida** → copie a **Production URL** → cole no painel do seu provedor de WhatsApp (Evolution API/Z-API/WPPConnect) como webhook de mensagem recebida.
3. Abra o node **Guardar mensagem** → troque `SEU-TENANT.dinyfestas.com.br` pelo subdomínio real da empresa e cole o `AGENT_API_SECRET` no header `x-diny-secret`.
4. **Ativar** o workflow.

**Fluxo de saída** (só se ainda não tiver dos lembretes):
5. Siga o passo a passo em [`N8N-LEMBRETES.md`](./N8N-LEMBRETES.md) — o mesmo node de "enviar WhatsApp" que manda lembrete também manda resposta do agente (o payload tem `toPhone`/`message` nos dois casos).

Se seu provedor não for nenhum dos 3 cobertos no fluxo de entrada, abra o node **"Extrair telefone e mensagem"** (Code) e ajusta o trecho `else { ... }` pro formato do seu payload — dá pra ver o payload cru testando o webhook uma vez (aba "Executions" do n8n mostra o corpo recebido).

## Ligar no ambiente (Vercel — produção)

```bash
OPENAI_API_KEY="sk-..."              # platform.openai.com → API Keys
OPENAI_MODEL="gpt-4o-mini"           # opcional, esse é o padrão (rápido e barato)
AGENT_API_SECRET="gere-uma-string-aleatoria-longa"
```

Sem `OPENAI_API_KEY`, o endpoint responde 503 (desligado, não quebra nada). Sem `AGENT_API_SECRET` batendo no header, responde 401.

## Ligar no worker (VPS) — pega o código novo do debounce

```bash
ssh -i ~/.ssh/diny_vps root@76.13.161.94
export GIT_SSH_COMMAND='ssh -i /root/.ssh/diny_deploy_key -o StrictHostKeyChecking=accept-new'
cd /var/www/diny-worker && git pull --ff-only
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24
pnpm install --silent
cd packages/core && node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma
cd /var/www/diny-worker/apps/worker && pm2 restart diny-worker
pm2 logs diny-worker --lines 15 --nostream
```

Deve aparecer: `worker pronto — lembretes a cada 60s, agente de IA a cada 10s`.

## Ajustar a locação mínima

Hoje: 4 horas, R$150 (valores padrão). Pra mudar por empresa, atualize `TenantSettings.minRentalHours`/`minRentalPrice` no banco (a IA lê esse valor a cada mensagem — muda na hora, sem precisar redeploy). Uma tela em `/admin/configuracoes` pra editar isso direto no painel ainda não existe.

## Teste de ponta a ponta

1. Configure as env vars acima na Vercel e redeploy; atualize o worker na VPS (passo acima).
2. Manda 2-3 mensagens seguidas rápido pro WhatsApp: "oi", "quanto custa a locação mínima?" — deve chegar **uma resposta só**, tratando as duas juntas.
3. Deve responder com o valor real (`R$150`, 4h) — não um valor inventado.
4. Pergunta por um brinquedo específico numa data — confere se a resposta bate com o que está em `/admin/brinquedos`.
5. Diz seu nome e confirma interesse — checa se aparece um Lead novo em `/admin/notificacoes` (o Lead vira Booking manualmente, a IA nunca confirma sozinha).
6. Logs: `pm2 logs diny-worker` (procure `[agent]` e `[n8n]`).
