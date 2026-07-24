/**
 * Cliente server-only do Evolution API (WhatsApp do Diny), atrás do nginx seguro
 * (evo.dinyfestas.com.br). Toda chamada leva DOIS segredos: a apikey do Evolution e o
 * x-diny-proxy (exigido pelo nginx). Nenhum deles vai pro navegador — só é usado em
 * server actions / server components.
 */
const API_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;
const PROXY = process.env.EVOLUTION_PROXY_SECRET;
const INSTANCE = process.env.EVOLUTION_INSTANCE || "diny-festas";

export type WhatsappState = "open" | "connecting" | "close" | "unknown";

export function evolutionConfigured(): boolean {
  return Boolean(API_URL && API_KEY && PROXY);
}

function headers(): Record<string, string> {
  return { apikey: API_KEY ?? "", "x-diny-proxy": PROXY ?? "", "content-type": "application/json" };
}

/** Estado da conexão: open = conectado, connecting = aguardando QR, close = desconectado. */
export async function getConnectionState(): Promise<WhatsappState> {
  if (!evolutionConfigured()) return "unknown";
  try {
    const res = await fetch(`${API_URL}/instance/connectionState/${INSTANCE}`, { headers: headers(), cache: "no-store" });
    if (!res.ok) return "unknown";
    const j = await res.json();
    return (j?.instance?.state as WhatsappState) ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Dispara a conexão e devolve o QR (base64) e/ou código de pareamento. */
export async function getQrCode(): Promise<{ base64?: string; pairingCode?: string; state: WhatsappState }> {
  if (!evolutionConfigured()) return { state: "unknown" };
  try {
    const res = await fetch(`${API_URL}/instance/connect/${INSTANCE}`, { headers: headers(), cache: "no-store" });
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
export async function sendText(phone: string, text: string): Promise<boolean> {
  if (!evolutionConfigured()) return false;
  try {
    const res = await fetch(`${API_URL}/message/sendText/${INSTANCE}`, {
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
export async function logoutInstance(): Promise<boolean> {
  if (!evolutionConfigured()) return false;
  try {
    const res = await fetch(`${API_URL}/instance/logout/${INSTANCE}`, { method: "DELETE", headers: headers() });
    return res.ok;
  } catch {
    return false;
  }
}
