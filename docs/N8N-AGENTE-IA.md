# Agente de IA no WhatsApp (atendimento + lead) via n8n

O n8n só faz o **relay**: recebe a mensagem do WhatsApp, chama nosso endpoint (que tem toda a inteligência — OpenAI + acesso ao catálogo/disponibilidade real), e manda a resposta de volta. **Nada aqui toca no zeus-estoque nem em qualquer outro app da VPS.**

**Workflow pronto pra importar**: [`n8n-agente-ia-workflow.json`](./n8n-agente-ia-workflow.json) — no n8n, vá em Workflows → Import from File. Já vem com Webhook → extrai telefone/mensagem (Evolution API/Z-API/WPPConnect) → checa se tem conteúdo → chama nosso endpoint. Só falta você: (1) copiar a URL do Webhook pro painel do seu provedor, (2) trocar `SEU-TENANT` e colar o `AGENT_API_SECRET` no node "Chamar agente Diny", (3) substituir o último node pelo envio de WhatsApp do seu provedor. Tudo isso está anotado direto no workflow (sticky notes).

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

## Passo a passo no n8n (~5 min, com o workflow pronto)

1. **Workflows → Import from File** → escolha `docs/n8n-agente-ia-workflow.json`.
2. Abra o node **Webhook - Mensagem Recebida** → copie a **Production URL** → cole no painel do seu provedor de WhatsApp (Evolution API/Z-API/WPPConnect) como webhook de mensagem recebida.
3. Abra o node **Chamar agente Diny** → troque `SEU-TENANT.dinyfestas.com.br` pelo subdomínio real da empresa e cole o `AGENT_API_SECRET` no header `x-diny-secret`.
4. Apague o node **"Enviar resposta - SUBSTITUIR"** e coloque no lugar o node de enviar WhatsApp do seu provedor, mandando `{{ $json.reply }}` pro telefone (`{{ $('Extrair telefone e mensagem').item.json.phone }}`).
5. **Ativar** o workflow (toggle no canto superior direito).

Se seu provedor não for nenhum dos 3 cobertos, abra o node **"Extrair telefone e mensagem"** (Code) e ajusta o trecho `else { ... }` pro formato do seu payload — é só JavaScript simples, dá pra ver o payload cru testando o webhook uma vez (aba "Executions" do n8n mostra o corpo recebido).

## Ligar no ambiente (Vercel — produção)

```bash
OPENAI_API_KEY="sk-..."              # platform.openai.com → API Keys
OPENAI_MODEL="gpt-4o-mini"           # opcional, esse é o padrão (rápido e barato)
AGENT_API_SECRET="gere-uma-string-aleatoria-longa"
```

Sem `OPENAI_API_KEY`, o endpoint responde 503 (desligado, não quebra nada). Sem `AGENT_API_SECRET` batendo no header, responde 401.

## Ajustar a locação mínima

Hoje: 4 horas, R$150 (valores padrão). Pra mudar por empresa, atualize `TenantSettings.minRentalHours`/`minRentalPrice` no banco (a IA lê esse valor a cada mensagem — muda na hora, sem precisar redeploy). Uma tela em `/admin/configuracoes` pra editar isso direto no painel ainda não existe.

## Teste de ponta a ponta

1. Configure as env vars acima na Vercel e redeploy.
2. Manda uma mensagem de teste pro número do WhatsApp conectado: "oi, quanto custa a locação mínima?"
3. Deve responder com o valor real (`R$150`, 4h) — não um valor inventado.
4. Pergunta por um brinquedo específico numa data — confere se a resposta bate com o que está em `/admin/brinquedos`.
5. Diz seu nome e confirma interesse — checa se aparece um Lead novo em `/admin/notificacoes` e `/admin/clientes` (leads, não clientes — o Lead vira Booking manualmente).
