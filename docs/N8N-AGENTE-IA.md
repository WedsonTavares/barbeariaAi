# Agente de IA no WhatsApp (atendimento + lead) via n8n

O n8n só faz o **relay**: recebe a mensagem do WhatsApp, chama nosso endpoint (que tem toda a inteligência — Claude + acesso ao catálogo/disponibilidade real), e manda a resposta de volta. **Nada aqui toca no zeus-estoque nem em qualquer outro app da VPS.**

## Como funciona

```
Cliente manda WhatsApp
        ↓
Provedor de WhatsApp (Evolution/Z-API/WPPConnect) → webhook de mensagem RECEBIDA
        ↓
n8n: extrai { phone, message } no formato do seu provedor
        ↓
n8n: POST https://SEU-TENANT.dinyfestas.com.br/api/agent/mensagem
      headers: x-diny-secret: <AGENT_API_SECRET>
      body: { "phone": "5516999999999", "message": "oi, tem pula-pula pro dia 15?" }
        ↓
Resposta: { "reply": "Oi! Deixa eu conferir..." , "leadCreated": false }
        ↓
n8n: manda `reply` de volta pro cliente no WhatsApp
```

O endpoint já faz sozinho: consulta o catálogo e preços reais, checa disponibilidade de verdade (mesma regra que bloqueia reserva dupla no painel), calcula a locação mínima configurada, cria um **Lead** (nunca uma reserva confirmada) quando o cliente demonstra interesse real, e notifica a equipe em `/admin/notificacoes`.

## O que a IA NUNCA faz (por design)
- Não confirma reserva, não processa pagamento, não trava brinquedo.
- Não inventa preço fora do catálogo nem disponibilidade sem checar.
- Não sai do assunto (brinquedos/preços/agendamento desta empresa).
- Tem limite de 15 mensagens/hora por telefone (rate limit) — depois disso, pede pra tentar mais tarde.

## Passo a passo no n8n (~10 min)

1. **Novo workflow** → nó **Webhook** (mensagem recebida do seu provedor de WhatsApp — configure no painel do provedor pra apontar pra essa URL do n8n).
2. Nó **Function/Set**: extrai `phone` e `message` do payload (formato varia por provedor — Evolution/Z-API/WPPConnect têm campos diferentes).
3. Nó **IF**: ignora mensagens de grupo, do próprio número, ou vazias (evita loop e custo à toa).
4. Nó **HTTP Request** → `POST https://SEU-TENANT.dinyfestas.com.br/api/agent/mensagem`, header `x-diny-secret`, body `{ phone, message }`.
5. Nó de **envio de WhatsApp** (o mesmo que você já usa) → manda `{{ $json.reply }}` de volta pro `phone`.
6. **Ativar** o workflow.

## Ligar no ambiente (Vercel — produção)

```bash
ANTHROPIC_API_KEY="sk-ant-..."       # console.anthropic.com → API Keys
AGENT_API_SECRET="gere-uma-string-aleatoria-longa"
```

Sem `ANTHROPIC_API_KEY`, o endpoint responde 503 (desligado, não quebra nada). Sem `AGENT_API_SECRET` batendo no header, responde 401.

## Ajustar a locação mínima

Hoje: 4 horas, R$150 (valores padrão). Pra mudar por empresa, atualize `TenantSettings.minRentalHours`/`minRentalPrice` no banco (a IA lê esse valor a cada mensagem — muda na hora, sem precisar redeploy). Uma tela em `/admin/configuracoes` pra editar isso direto no painel ainda não existe.

## Teste de ponta a ponta

1. Configure as env vars acima na Vercel e redeploy.
2. Manda uma mensagem de teste pro número do WhatsApp conectado: "oi, quanto custa a locação mínima?"
3. Deve responder com o valor real (`R$150`, 4h) — não um valor inventado.
4. Pergunta por um brinquedo específico numa data — confere se a resposta bate com o que está em `/admin/brinquedos`.
5. Diz seu nome e confirma interesse — checa se aparece um Lead novo em `/admin/notificacoes` e `/admin/clientes` (leads, não clientes — o Lead vira Booking manualmente).
