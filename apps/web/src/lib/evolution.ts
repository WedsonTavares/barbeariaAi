/**
 * Cliente server-only do Evolution API, atrás do proxy seguro do ambiente.
 * Toda chamada leva DOIS segredos: a apikey do Evolution e o
 * header de proxy configurado no ambiente. Nenhum deles vai pro navegador — só é usado em
 * server actions / server components.
 *
 * MULTI-TENANT: a `instance` é SEMPRE por tenant (vem de TenantSettings.evolutionInstance,
 * com fallback pro slug). Nunca use uma instância global — é o que impede uma empresa
 * de ler ou desconectar o WhatsApp da outra.
 */
const API_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;
const PROXY = process.env.EVOLUTION_PROXY_SECRET;
const PROXY_HEADER = process.env.EVOLUTION_PROXY_HEADER ?? "x-evolution-proxy";

export type WhatsappState = "open" | "connecting" | "close" | "unknown";

/**
 * Servidores e instâncias de OUTRO produto (Diny Festas). Este app nunca pode
 * falar com eles.
 *
 * O perigo é concreto e silencioso: `tenantService.evolutionInstance()` cai no
 * SLUG do tenant quando `evolutionInstance` está vazio, e as ações do painel
 * (`ensureInstance`, `getQrCode`, `logoutInstance`) mandam esse nome direto pro
 * host configurado. Bastaria alguém reaproveitar a URL/API key do Evolution do
 * Diny aqui para o botão "Desconectar" de Configurações derrubar o WhatsApp de
 * produção do outro negócio.
 */
const HOSTS_PROIBIDOS = ["evo.dinyfestas.com.br", "dinyfestas.com.br"];
const INSTANCIAS_PROIBIDAS = ["diny-festas", "diny", "evolution-diny", "dinyfestas"];

function hostProibido(): string | null {
  if (!API_URL) return null;
  let hostname: string;
  try {
    hostname = new URL(API_URL).hostname.toLowerCase();
  } catch {
    return null;
  }
  return HOSTS_PROIBIDOS.find((proibido) => hostname === proibido || hostname.endsWith(`.${proibido}`)) ?? null;
}

function instanciaProibida(instance: string): boolean {
  return INSTANCIAS_PROIBIDAS.includes(instance.trim().toLowerCase());
}

/**
 * Fail-closed: qualquer chamada para um host ou instância de outro produto é
 * recusada aqui, antes de virar requisição.
 */
function bloqueado(instance?: string): boolean {
  const host = hostProibido();
  if (host) {
    console.error(
      `[evolution] BLOQUEADO: EVOLUTION_API_URL aponta para ${host}, que é do Diny Festas. ` +
        "A Barbearia AI precisa de um Evolution próprio (container, banco, API key e domínio separados)."
    );
    return true;
  }
  if (instance && instanciaProibida(instance)) {
    console.error(
      `[evolution] BLOQUEADO: a instância "${instance}" é do Diny Festas. ` +
        "Defina TenantSettings.evolutionInstance deste tenant com um nome próprio."
    );
    return true;
  }
  return false;
}

export function evolutionConfigured(): boolean {
  return Boolean(API_URL && API_KEY && PROXY) && !bloqueado();
}

function headers(): Record<string, string> {
  return { apikey: API_KEY ?? "", [PROXY_HEADER]: PROXY ?? "", "content-type": "application/json" };
}

/** Estado da conexão: open = conectado, connecting = aguardando QR, close = desconectado. */
export async function getConnectionState(instance: string): Promise<WhatsappState> {
  if (!evolutionConfigured() || !instance || bloqueado(instance)) return "unknown";
  try {
    const res = await fetch(`${API_URL}/instance/connectionState/${instance}`, { headers: headers(), cache: "no-store" });
    // 404 = a instância ainda não existe no Evolution. É o estado NORMAL de uma
    // empresa nova, não uma falha: ela só é criada por `ensureInstance`, que roda
    // ao pedir o primeiro QR. Tratar isso como "unknown" travava o cadastro —
    // a tela mostrava erro e escondia justamente o botão que criaria a instância.
    if (res.status === 404) return "close";
    if (!res.ok) return "unknown";
    const j = await res.json();
    return (j?.instance?.state as WhatsappState) ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * A instância existe no Evolution?
 *
 * Pergunta diferente de "está conectada" — e foi confundi-las que quebrou a
 * criação: `getConnectionState` traduz 404 para "close" (a tela precisa disso,
 * senão mostra erro em vez do botão de conectar), e o `ensureInstance` lia esse
 * "close" como "já existe" e não criava nada.
 *
 * `null` = não deu para saber (rede fora, host bloqueado). Nesse caso não se
 * cria nada: melhor não agir do que criar instância duplicada às cegas.
 */
async function instanciaExiste(instance: string): Promise<boolean | null> {
  if (!evolutionConfigured() || !instance || bloqueado(instance)) return null;
  try {
    const res = await fetch(`${API_URL}/instance/connectionState/${instance}`, { headers: headers(), cache: "no-store" });
    if (res.status === 404) return false;
    if (!res.ok) return null;
    return true;
  } catch {
    return null;
  }
}

/** Webhook que a instância deve chamar quando chegar mensagem. */
export type InstanceWebhook = { url: string; headers?: Record<string, string> };

/**
 * Cria a instância no Evolution se ainda não existir (tenant novo conectando pela
 * primeira vez). Idempotente: se já existe, o Evolution devolve erro e seguimos.
 *
 * O `webhook` NÃO é opcional na prática: sem ele a instância nasce muda. Ela
 * conecta, a tela mostra "conectado" e nenhuma mensagem chega em
 * `/api/whatsapp/inbound` — falha silenciosa, sem erro em lugar nenhum. Quem
 * chama é responsável por montar a URL com o host DESTE tenant e o segredo
 * DELE; é o que garante que a mensagem de uma loja não caia no inbox de outra.
 *
 * O segredo vai em HEADER, não na query string: a URL do webhook aparece em log
 * de acesso, `Referer` e histórico de proxy.
 */
export async function ensureInstance(instance: string, webhook?: InstanceWebhook): Promise<void> {
  if (!evolutionConfigured() || !instance || bloqueado(instance)) return;
  try {
    const existe = await instanciaExiste(instance);
    if (existe !== false) return; // já existe, ou não deu para confirmar
    await fetch(`${API_URL}/instance/create`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        instanceName: instance,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        groupsIgnore: true,
        ...(webhook
          ? {
              webhook: {
                url: webhook.url,
                enabled: true,
                events: ["MESSAGES_UPSERT"],
                ...(webhook.headers ? { headers: webhook.headers } : {}),
              },
            }
          : {}),
      }),
    });
  } catch {
    // se falhar, o connect abaixo ainda tenta — não travamos a tela do usuário
  }
}

/**
 * Dispara a conexão e devolve o QR (base64) e/ou o código de pareamento.
 *
 * Passando `phone`, o Evolution devolve um CÓDIGO de 8 caracteres em vez de
 * exigir a câmera. Isso importa mais do que parece: o dono da barbearia abre o
 * painel no próprio celular (ele é instalável como app), e ninguém escaneia um
 * QR exibido na mesma tela em que precisaria apontar a câmera. Com o código, o
 * fluxo inteiro acontece num aparelho só.
 */
export async function getQrCode(
  instance: string,
  phone?: string
): Promise<{ base64?: string; pairingCode?: string; state: WhatsappState }> {
  if (!evolutionConfigured() || !instance || bloqueado(instance)) return { state: "unknown" };
  try {
    const numero = phone?.replace(/\D/g, "");
    const url = new URL(`${API_URL}/instance/connect/${instance}`);
    if (numero) url.searchParams.set("number", numero);
    const res = await fetch(url, { headers: headers(), cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    return {
      base64: j?.base64 ?? j?.qrcode?.base64,
      pairingCode: j?.pairingCode ?? j?.qrcode?.pairingCode,
      state: (j?.instance?.state as WhatsappState) ?? "connecting",
    };
  } catch {
    return { state: "unknown" };
  }
}

/**
 * Estado de TODAS as instâncias em UMA chamada, indexado por nome da instância.
 *
 * Existe para o painel do super admin: com uma chamada por loja, a tela ficaria
 * mais lenta a cada cliente novo e ainda castigaria o Evolution. `fetchInstances`
 * devolve todas de uma vez.
 *
 * Devolve Map vazio se o Evolution estiver fora — quem chama mostra "sem
 * informação", que é diferente de "desconectado". Confundir os dois faria a
 * tela gritar que todas as lojas caíram quando o problema é o Evolution.
 */
export async function fetchAllConnectionStates(): Promise<Map<string, WhatsappState>> {
  const estados = new Map<string, WhatsappState>();
  if (!evolutionConfigured()) return estados;
  try {
    const res = await fetch(`${API_URL}/instance/fetchInstances`, { headers: headers(), cache: "no-store" });
    if (!res.ok) return estados;
    const lista = await res.json();
    if (!Array.isArray(lista)) return estados;
    for (const item of lista) {
      // v2 devolve { name, connectionStatus }. Os nomes mudaram entre versões
      // do Evolution, então aceitamos os dois formatos em vez de quebrar num upgrade.
      const nome = item?.name ?? item?.instance?.instanceName;
      const estado = item?.connectionStatus ?? item?.instance?.state;
      if (typeof nome === "string" && nome) estados.set(nome, (estado as WhatsappState) ?? "unknown");
    }
    return estados;
  } catch {
    return estados;
  }
}

/** Envia uma mensagem de texto pra um número via WhatsApp (Evolution). */
export async function sendText(instance: string, phone: string, text: string): Promise<boolean> {
  if (!evolutionConfigured() || !instance || bloqueado(instance)) return false;
  try {
    const res = await fetch(`${API_URL}/message/sendText/${instance}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ number: phone, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Desconecta o WhatsApp (logout) — a IA para de receber/responder até reconectar. */
export async function logoutInstance(instance: string): Promise<boolean> {
  if (!evolutionConfigured() || !instance || bloqueado(instance)) return false;
  try {
    const res = await fetch(`${API_URL}/instance/logout/${instance}`, { method: "DELETE", headers: headers() });
    return res.ok;
  } catch {
    return false;
  }
}
