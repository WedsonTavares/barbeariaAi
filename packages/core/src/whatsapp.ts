/**
 * Leitura do payload do Evolution API v2.
 *
 * Mora no core, e não na rota, porque é lógica pura com muitos casos de
 * borda — grupo, canal, status, áudio, imagem, legenda — e cada um deles já
 * custou um comportamento errado em produção. Aqui dá para testar sem banco
 * e sem subir o Next.
 */

/**
 * Origens que nunca são atendimento: grupo, canal e status.
 *
 * O `groupsIgnore` da instância já barra grupo no Evolution, mas canal e status
 * chegavam — viravam conversa no funil como se fossem cliente.
 */
const JID_IGNORADO = /@(g\.us|newsletter|broadcast)$/;

/** Mídia que o agente sabe tratar (transcrever, descrever). O resto é ignorado. */
const MIDIA_SUPORTADA = new Set(["audioMessage", "imageMessage"]);

/** Como a mídia aparece no inbox enquanto a transcrição não volta. */
const MARCADOR: Record<string, string> = {
  audioMessage: "🎤 Áudio",
  imageMessage: "🖼️ Imagem",
};

export interface Recebida {
  phone: string;
  /** Texto para o inbox. Em mídia, é a legenda ou um marcador. */
  text: string;
  fromMe: boolean;
  ignorado: boolean;
  name?: string;
  messageType: string;
  /** Payload original do Evolution, repassado ao n8n sem alteração. */
  data: Record<string, unknown>;
}

/**
 * Extrai o essencial do payload do Evolution API v2.
 *
 * Devolve também o `data` cru: o workflow precisa de `key.id` para baixar a
 * mídia e de `messageType` para classificar, e reconstruir isso a partir de um
 * resumo seria inventar informação que já existe.
 */
export function parseEvolution(body: Record<string, unknown>): Recebida | null {
  const data = (body?.data ?? body) as Record<string, unknown> | undefined;
  const key = data?.key as Record<string, unknown> | undefined;
  if (!data || !key) return null;

  const jid = String(key.remoteJid ?? "");
  const phone = jid.replace(/@.*$/, "").replace(/\D/g, "");
  const msg = (data.message ?? {}) as Record<string, unknown>;
  const ext = msg.extendedTextMessage as Record<string, unknown> | undefined;
  const img = msg.imageMessage as Record<string, unknown> | undefined;

  const messageType = String(
    data.messageType ?? (msg.conversation !== undefined ? "conversation" : "")
  );
  const texto = String(msg.conversation ?? ext?.text ?? "").trim();
  const legenda = String(img?.caption ?? "").trim();

  const ehMidia = MIDIA_SUPORTADA.has(messageType);
  // Mídia entra mesmo sem texto: o marcador faz o card aparecer no funil, e o
  // n8n recebe o `data` para transcrever ou descrever.
  const text = texto || legenda || (ehMidia ? MARCADOR[messageType] ?? "📎 Mídia" : "");

  return {
    phone,
    text,
    fromMe: key.fromMe === true,
    ignorado: JID_IGNORADO.test(jid) || (!texto && !ehMidia),
    name: (data.pushName as string) || undefined,
    messageType,
    data,
  };
}
