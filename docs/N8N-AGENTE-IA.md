# Agente de IA no WhatsApp — dentro do n8n

O agente **roda inteiramente no n8n** (nó AI Agent). O prompt é editável na tela do n8n, a memória da conversa fica no Postgres (mesmo Supabase), e a IA usa duas "ferramentas" que são endpoints nossos — eles garantem tenant + segurança + a regra de "nunca confirmar reserva". **Nada aqui toca no zeus-estoque nem em qualquer workflow/credencial do Zeus** — o workflow se chama "Diny - Agente IA WhatsApp" e a credencial de banco é nova e separada.

## Arquitetura

```
Cliente manda WhatsApp
        ↓
Provedor (Evolution/Z-API/WPPConnect) → webhook → n8n
        ↓
n8n [Extrair telefone/mensagem] → [AI Agent]
                                      ├── Modelo: OpenAI (gpt-4o-mini)
                                      ├── Memória: Postgres (tabela diny_chat_histories, por telefone)
                                      └── Ferramentas (HTTP, nossos endpoints):
                                          • disponibilidade → confere brinquedo livre (leitura)
                                          • criar_lead → registra interesse pra equipe (nunca reserva)
        ↓
n8n [Enviar resposta] → WhatsApp do cliente
```

Diferente da versão anterior: **não tem mais código de IA no nosso backend nem no worker** — só os 2 endpoints-ferramenta. O contexto/memória é responsabilidade do próprio n8n (nó de memória Postgres), não da nossa tabela.

## O que a IA NUNCA faz (garantido pelos endpoints, não só pelo prompt)
- **Criar reserva ou processar pagamento**: não existe endpoint pra isso. O máximo que ela faz é criar um **Lead** (`/api/agent/lead`) pra equipe confirmar no painel.
- **Ver dados de outra empresa**: cada endpoint resolve o tenant pelo subdomínio da URL e escopa tudo por RLS.
- **Inventar preço/disponibilidade**: a ferramenta de disponibilidade usa a mesma checagem real que bloqueia reserva dupla no painel.

## Passo a passo (~15 min)

### 1. Importar o workflow
n8n (https://n8n.zeus-estoque.com.br) → **Workflows → Import from File** → `docs/n8n-agente-ia-workflow.json`. Ele vem como **"Diny - Agente IA WhatsApp"**. Não altere os workflows do Zeus.

### 2. Credencial da OpenAI
No node **OpenAI Model** → selecione a credencial OpenAI (ou crie uma com a `OPENAI_API_KEY`). Se você já usa OpenAI em outro workflow, pode reutilizar a credencial (é só a chave da OpenAI, não é do Zeus).

### 3. Credencial Postgres NOVA (só pro Diny) — cuidado
No node **Memória Postgres (contexto)** → **Create New Credential** (Postgres):
- Host: `aws-1-sa-east-1.pooler.supabase.com`
- Database: `postgres`
- User: `app_runtime.rzezilteejznqnmonhyi`
- Password: (a senha do `app_runtime` — a mesma do `DATABASE_URL` de produção; me peça se não tiver)
- Port: `6543`
- SSL: `require`

Nomeie a credencial como **"Diny - Supabase"** pra não confundir com nada do Zeus. A tabela `diny_chat_histories` é criada automaticamente pelo n8n na primeira execução (nome com prefixo `diny_` justamente pra não colidir).

### 4. As duas ferramentas HTTP
Nos nodes **Ferramenta: disponibilidade** e **Ferramenta: criar lead**:
- Troque `SEU-TENANT.dinyfestas.com.br` pelo subdomínio real da empresa (ex.: `dineplay.dinyfestas.com.br`).
- Cole o `AGENT_API_SECRET` no header `x-diny-secret` (é o mesmo nos dois).

### 5. Webhook de entrada
Node **Webhook - Mensagem Recebida** → copie a **Production URL** → cole no painel do seu provedor de WhatsApp como webhook de mensagem recebida. Se o seu provedor não for Evolution/Z-API/WPPConnect, ajuste o `else` do node **Extrair telefone e mensagem**.

### 6. Enviar a resposta
Apague o node **"Enviar resposta - SUBSTITUIR"** e ponha no lugar o node de enviar WhatsApp do seu provedor, mandando `{{ $json.output }}` pro telefone `{{ $('Extrair telefone e mensagem').item.json.phone }}`.

### 7. Ativar e testar
Ative o workflow. Mande uma mensagem de teste: "quanto custa a locação mínima?" → deve responder "4 horas, R$150". Pergunte por um brinquedo numa data → confere se bate com `/admin/brinquedos`. Diga seu nome + interesse → deve aparecer um Lead em `/admin/notificacoes`.

## Editar o prompt
No node **AI Agent**, campo **System Message** — edite à vontade, direto na tela do n8n, sem depender de deploy. (A locação mínima está escrita no prompt como 4h/R$150; se mudar o preço, atualize aqui também.)

## Variáveis no ambiente (Vercel)

Os endpoints-ferramenta precisam só disto (a OpenAI agora é chamada pelo n8n, não pela Vercel):

```bash
AGENT_API_SECRET="a mesma string que você colou no header x-diny-secret do n8n"
```

Sem `AGENT_API_SECRET`, os endpoints `/api/agent/*` rejeitam tudo (401) — seguro por padrão.

## Debounce (agrupar mensagens rápidas)
Esta versão responde **cada mensagem** que chega. Se o cliente manda 3 mensagens picadas em sequência, o agente responde 3 vezes (mas com contexto, graças à memória). Um "debounce" (esperar silêncio e juntar) é difícil de fazer de forma confiável no n8n puro — se isso incomodar na prática, dá pra adicionar depois um node de espera/agrupamento, ou voltar o agrupamento pro nosso backend.
