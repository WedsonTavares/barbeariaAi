import { describe, expect, it } from "vitest";

import { parseEvolution } from "../whatsapp";

/** Monta um payload do Evolution com o mínimo que a leitura precisa. */
function payload(jid: string, messageType: string, message: Record<string, unknown>, extra = {}) {
  return { data: { key: { remoteJid: jid, id: "MSG1" }, messageType, message, pushName: "Cliente", ...extra } };
}

const CLIENTE = "5516999998888@s.whatsapp.net";

describe("parseEvolution — o que entra no atendimento", () => {
  it("texto simples vira a própria mensagem", () => {
    const r = parseEvolution(payload(CLIENTE, "conversation", { conversation: "Oi" }))!;
    expect(r.ignorado).toBe(false);
    expect(r.text).toBe("Oi");
    expect(r.phone).toBe("5516999998888");
  });

  it("texto estendido (resposta/citação) também entra", () => {
    const r = parseEvolution(payload(CLIENTE, "extendedTextMessage", { extendedTextMessage: { text: "Bom dia" } }))!;
    expect(r.text).toBe("Bom dia");
    expect(r.ignorado).toBe(false);
  });

  it("mensagem própria é marcada como fromMe", () => {
    const p = payload(CLIENTE, "conversation", { conversation: "resposta" });
    p.data.key = { ...p.data.key, fromMe: true } as never;
    expect(parseEvolution(p)!.fromMe).toBe(true);
  });
});

describe("parseEvolution — mídia", () => {
  it("áudio entra mesmo sem texto, com marcador para o funil", () => {
    const r = parseEvolution(payload(CLIENTE, "audioMessage", { audioMessage: {} }))!;
    expect(r.ignorado).toBe(false);
    expect(r.text).toBe("🎤 Áudio");
    expect(r.messageType).toBe("audioMessage");
  });

  it("imagem sem legenda ganha marcador", () => {
    expect(parseEvolution(payload(CLIENTE, "imageMessage", { imageMessage: {} }))!.text).toBe("🖼️ Imagem");
  });

  it("a legenda da imagem vale mais que o marcador", () => {
    const r = parseEvolution(payload(CLIENTE, "imageMessage", { imageMessage: { caption: "quero esse corte" } }))!;
    expect(r.text).toBe("quero esse corte");
  });

  it("devolve o payload cru — é dele que o n8n tira key.id para baixar a mídia", () => {
    const r = parseEvolution(payload(CLIENTE, "audioMessage", { audioMessage: {} }))!;
    expect((r.data.key as { id: string }).id).toBe("MSG1");
  });

  it("mídia que o agente não trata é ignorada", () => {
    expect(parseEvolution(payload(CLIENTE, "stickerMessage", { stickerMessage: {} }))!.ignorado).toBe(true);
  });
});

describe("parseEvolution — o que nunca é atendimento", () => {
  it.each([
    ["grupo", "12345-678@g.us"],
    ["canal", "12345@newsletter"],
    ["status", "status@broadcast"],
  ])("%s é ignorado mesmo com texto", (_nome, jid) => {
    expect(parseEvolution(payload(jid, "conversation", { conversation: "oi" }))!.ignorado).toBe(true);
  });

  it("mensagem sem texto e sem mídia suportada é ignorada", () => {
    expect(parseEvolution(payload(CLIENTE, "conversation", {}))!.ignorado).toBe(true);
  });

  it("payload sem key não é mensagem", () => {
    expect(parseEvolution({ data: {} })).toBeNull();
    expect(parseEvolution({})).toBeNull();
  });
});
