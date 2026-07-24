# Agente de IA no WhatsApp — dentro do n8n (workflow completo)

O agente **roda inteiramente no n8n**. O prompt é editável na tela (node AI Agent), a memória fica no Postgres (Supabase), o agrupamento de mensagens usa o Redis da VPS, e a IA usa 4 "ferramentas" que são endpoints nossos (garantem tenant + segurança + a regra de "nunca confirmar reserva"). **Nada aqui toca no zeus-estoque nem em qualquer workflow/credencial do Zeus.**

## O fluxo completo (o que cada bloco faz)

```
WhatsApp → Webhook
  → Extrair dados (telefone, mensagem, se é grupo, se é a equipe respondendo, origem)
  → Filtro: tem texto e não é grupo?           (ignora grupos e mensagens vazias)
  → Filtro: a equipe respondeu (fromMe)?        (se um humano respondeu manualmente,
        └─ SIM → Redis marca "humano no controle" por 1h e para (bot fica quieto)
  → Redis: humano está no controle? → Filtro: bot pode responder?  (respeita o humano)
  → Filtro: modo teste                          (opcional: só nº de teste passam)
  → Mapear dados                                (organiza phone/mensagem/nome/origem)
  → Redis buffer: junta esta mensagem às anteriores desse telefone
  → Redis: marca esta execução como "a última"
  → ESPERA 15s                                  (debounce: se o cliente mandar mais
  → Redis: quem é a última? → sou eu?              mensagens picadas, só a última segue)
        └─ NÃO → para (a mensagem mais nova assume)
  → Redis: pega todas as mensagens juntas → apaga buffer → apaga marcador
  → AI Agent (Dinha)                            (prompt + memória + 4 ferramentas)
  → Enviar resposta no WhatsApp
```

### As 4 ferramentas da IA (endpoints nossos, seguros)
- **info** (`/api/agent/info`): horários, endereço, cidade, taxa de entrega, política de sinal, catálogo, preços, locação mínima.
- **disponibilidade** (`/api/agent/disponibilidade`): confere se um brinquedo está livre numa data (mesma checagem que bloqueia reserva dupla no painel).
- **registrar_interesse** (`/api/agent/lead`): cria um Lead pra equipe confirmar. **Nunca** cria reserva nem mexe em pagamento.
- **suporte_humano** (`/api/agent/suporte`): avisa a equipe que o cliente quer um atendente. (Quando a equipe responde pelo WhatsApp, o bot detecta o `fromMe` e se cala por 1h automaticamente.)

## Segurança (por que é seguro mesmo com a IA)
- A IA **não tem** ferramenta de confirmar reserva ou pagamento — não existe endpoint pra isso. O máximo é registrar interesse.
- Cada endpoint resolve o tenant pelo subdomínio da URL e escopa tudo por RLS — a IA nunca vê dado de outra empresa.
- Todos os endpoints exigem o header `x-diny-secret` = `AGENT_API_SECRET`. Sem ele, 401.
- O buffer no Redis usa chaves com prefixo `diny:` — isoladas de qualquer outra coisa na VPS.

## Passo a passo (importar e configurar)

> ⚠️ Este workflow é grande (29 nós). Ao importar, o n8n pode pedir pequenos ajustes conforme a versão dele (principalmente nos nós Redis e nos sub-nós do AI Agent). Se algum nó vier com aviso, me chame que a gente acerta aquele nó específico.

### 1. Importar
n8n (https://n8n.zeus-estoque.com.br) → **Workflows → Import from File** → `docs/n8n-agente-ia-workflow.json`. Vem como **"Diny - Agente IA WhatsApp"**. Não altere workflows do Zeus.

### 2. Credenciais (crie NOVAS e separadas — nunca reaproveite as do Zeus)
- **OpenAI** (node "OpenAI Model"): sua chave OpenAI. Pode reutilizar se já tiver uma credencial OpenAI só sua.
- **Postgres** (node "Memória Postgres"): **Create New** → nomeie "Diny - Supabase":
  - Host `aws-1-sa-east-1.pooler.supabase.com` · DB `postgres` · User `app_runtime.rzezilteejznqnmonhyi` · Port `6543` · SSL `require` · senha do `app_runtime` (me peça se não tiver).
- **Redis** (todos os nós "Redis: ..."): **Create New** → nomeie "Diny - Redis":
  - Host `127.0.0.1` · Port `6379` · Password: a senha do Redis da VPS (a mesma do `REDIS_URL` do worker). Selecione essa credencial em TODOS os nós Redis.

### 3. As 4 ferramentas + endpoints
Em cada node-ferramenta (info, disponibilidade, registrar_interesse, suporte_humano): troque `SEU-TENANT.dinyfestas.com.br` pelo subdomínio real e cole o `AGENT_API_SECRET` no header `x-diny-secret`.

### 4. Webhook de entrada
Node "Webhook - Mensagem Recebida" → copie a **Production URL** → cole no painel do seu provedor de WhatsApp. Se não for Evolution/Z-API/WPPConnect, ajuste o node "Extrair dados".

### 5. Enviar resposta
Apague "Enviar resposta - SUBSTITUIR" e ponha o node de enviar WhatsApp do seu provedor, mandando `{{ $json.output }}` pro telefone `{{ $('Mapear dados').item.json.phone }}`.

### 6. Modo teste (opcional, recomendado no começo)
No node "Filtro: modo teste": edite a lista de números `['5516999999999','5516000000000']` pros seus números de teste. Para LIGAR o modo teste (só esses números recebem resposta), crie uma variável no n8n (Settings → Variables) `DINY_TEST_MODE = on`. Para abrir pra todo mundo, deixe sem essa variável (ou `off`).

### 7. Ativar e testar
Ative o workflow. Mande do seu número de teste: "oi", depois "quanto custa a locação mínima?" (mande as duas rápido) → deve chegar **uma resposta só**, com o valor real. Depois teste: pergunta de disponibilidade, dizer nome+interesse (vira Lead em /admin/notificacoes), e pedir "quero falar com uma pessoa" (vira notificação de suporte humano).

## Editar o prompt
Node **AI Agent (Dinha)** → campo **System Message**. O texto completo e comentado está em [`agente-prompt.md`](./agente-prompt.md). Edite direto na tela do n8n, sem deploy.

## Variável no ambiente (Vercel)
Só isto (a OpenAI é chamada pelo n8n agora, não pela Vercel):
```bash
AGENT_API_SECRET="a mesma string do header x-diny-secret dos nós-ferramenta"
```

## Observações
- **Debounce de 15s**: se o cliente manda mensagens picadas, elas são juntadas e respondidas de uma vez. O tempo é editável no node "Espera 15s".
- **Handoff humano**: quando um atendente responde pelo WhatsApp, o bot detecta e se cala por 1h (chave `diny:human:<telefone>` no Redis). Pra reativar antes, apague essa chave no Redis.
- **Origem do lead**: o node "Extrair dados" tenta detectar (instagram/facebook/google/indicação) pelo texto — ajuste as palavras-chave conforme suas campanhas.
