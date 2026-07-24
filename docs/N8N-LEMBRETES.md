# Lembretes no WhatsApp via n8n (VPS)

O worker já dispara um webhook quando um lembrete vence. Falta só criar o fluxo no n8n (que já roda na sua VPS) e ligar 2 variáveis de ambiente. **Nada aqui toca no zeus-estoque nem em qualquer outro app da VPS** — só o processo `diny-worker`.

> Os **lembretes** (este doc) e o **[agente de IA](./N8N-AGENTE-IA.md)** são fluxos independentes no n8n: o lembrete é o worker que envia; o agente é o n8n que recebe/responde. Cada um tem seu workflow.

## Como funciona

```
lembrete vence → worker grava Notification (painel)  ← já funcionava
                → worker POSTa no webhook do n8n     ← NOVO (não-bloqueante)
                → n8n manda a mensagem no seu WhatsApp
```

Se o n8n estiver fora do ar, **nada quebra**: o lembrete continua aparecendo no painel.

## Payload que o worker envia (POST JSON)

```json
{
  "event": "booking_reminder",
  "tenantId": "…",
  "type": "PICKUP_30M",
  "title": "Retirada em 30 minutos",
  "message": "🔔 Retirada em 30 minutos\n👤 Maria (16 9…)\n📍 Rua X — Centro\n🕒 Retirada: 23/07/2026 17:30",
  "toPhone": "5516993294815",
  "booking": { "id": "…", "customerName": "…", "customerPhone": "…", "address": "…", "neighborhood": "…", "pickupAt": "ISO", "pickupAtLocal": "23/07/2026 17:30" }
}
```

- `toPhone` vem de `TenantSettings.whatsappAlerts` (ou `whatsappMain` se vazio) — **cada empresa recebe no próprio número**.
- `message` já vem pronta pra enviar como texto.
- Header `x-diny-secret` é enviado se `N8N_WEBHOOK_SECRET` estiver configurado (valide no n8n!).

## Passo a passo no n8n (~10 min)

1. **Novo workflow** → nó **Webhook**: método `POST`, path ex.: `diny-lembretes`. Copie a URL de produção (ex.: `https://SEU-N8N/webhook/diny-lembretes`).
2. Nó **IF** logo após: condição `{{ $json.headers["x-diny-secret"] }}` igual ao seu segredo (gere um: qualquer string longa aleatória). Caminho falso → parar.
3. Nó de **envio de WhatsApp** (o que você já usa no n8n — Evolution API, Z-API, WPPConnect etc.):
   - Número destino: `{{ $json.body.toPhone }}`
   - Texto: `{{ $json.body.message }}`
4. **Ativar** o workflow (toggle Active).

> Não tem canal de WhatsApp no n8n ainda? Alternativa em 2 min pra já ter aviso no celular: use um nó de **Telegram** (bot oficial, grátis) com o mesmo `message`. O WhatsApp entra depois.

## Ligar no worker (VPS) — únicos comandos que encostam na VPS

```bash
ssh -i ~/.ssh/diny_vps root@76.13.161.94

# 1) adicionar as variáveis SOMENTE no .env do diny-worker
cat >> /var/www/diny-worker/apps/worker/.env <<'EOF'
N8N_WEBHOOK_URL="https://SEU-N8N/webhook/diny-lembretes"
N8N_WEBHOOK_SECRET="seu-segredo-aleatorio"
EOF

# 2) atualizar o código e reiniciar SÓ o diny-worker
cd /var/www/diny-worker && git pull && pnpm install --silent
pm2 restart diny-worker && pm2 logs diny-worker --lines 10 --nostream
```

⚠️ **Nunca** rode `pm2 restart all` / `pm2 update` — os outros apps (zeus-estoque etc.) não podem ser tocados.

## Teste de ponta a ponta

1. No painel, crie uma reserva com **retirada daqui a ~20 min** e confirme-a (gera os lembretes de 15min/agora/atraso).
2. Em até 1 min do horário, deve chegar: notificação no painel **e** mensagem no WhatsApp/Telegram.
3. Logs: `pm2 logs diny-worker` (procure `[reminders]` e `[n8n]`).
