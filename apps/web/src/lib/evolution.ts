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
    if (!res.ok) return "unknown";
    const j = await res.json();
    return (j?.instance?.state as WhatsappState) ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Cria a instância no Evolution se ainda não existir (tenant novo conectando pela
 * primeira vez). Idempotente: se já existe, o Evolution devolve erro e seguimos.
 */
export async function ensureInstance(instance: string, webhookUrl?: string): Promise<void> {
  if (!evolutionConfigured() || !instance || bloqueado(instance)) return;
  try {
    const state = await getConnectionState(instance);
    if (state !== "unknown") return; // já existe
    await fetch(`${API_URL}/instance/create`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        instanceName: instance,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        groupsIgnore: true,
        ...(webhookUrl ? { webhook: { url: webhookUrl, enabled: true, events: ["MESSAGES_UPSERT"] } } : {}),
      }),
    });
  } catch {
    // se falhar, o connect abaixo ainda tenta — não travamos a tela do usuário
  }
}

/** Dispara a conexão e devolve o QR (base64) e/ou código de pareamento. */
export async function getQrCode(instance: string): Promise<{ base64?: string; pairingCode?: string; state: WhatsappState }> {
  if (!evolutionConfigured() || !instance || bloqueado(instance)) return { state: "unknown" };
  try {
    const res = await fetch(`${API_URL}/instance/connect/${instance}`, { headers: headers(), cache: "no-store" });
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
