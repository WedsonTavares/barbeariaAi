import { describe, expect, it } from "vitest";

import { brPhoneMatchKey } from "../phone";

/**
 * Casamento entre o telefone que vem do Google Places (com máscara, às vezes
 * fixo) e o que vem do WhatsApp (55 + DDD + número). Errar aqui é registrar a
 * resposta de uma empresa no lead de outra, então o teste cobre tanto o que
 * DEVE casar quanto o que não pode.
 */
describe("brPhoneMatchKey", () => {
  it("casa o mesmo celular vindo do Google e do WhatsApp", () => {
    const doGoogle = brPhoneMatchKey("(16) 99207-8710");
    const doWhatsapp = brPhoneMatchKey("5516992078710");
    expect(doGoogle).toBe(doWhatsapp);
    expect(doGoogle).not.toBeNull();
  });

  it("casa apesar do nono dígito faltando de um lado", () => {
    // O mesmo número gravado antes e depois da migração para 9 dígitos.
    expect(brPhoneMatchKey("16992078710")).toBe(brPhoneMatchKey("1692078710"));
  });

  it("casa telefone fixo com máscara", () => {
    expect(brPhoneMatchKey("(16) 3325-2347")).toBe(brPhoneMatchKey("551633252347"));
  });

  it("não casa números de DDDs diferentes com o mesmo final", () => {
    expect(brPhoneMatchKey("(16) 99207-8710")).not.toBe(brPhoneMatchKey("(11) 99207-8710"));
  });

  it("não casa números realmente diferentes no mesmo DDD", () => {
    expect(brPhoneMatchKey("(16) 99207-8710")).not.toBe(brPhoneMatchKey("(16) 99207-8711"));
  });

  it("devolve null para o que não é telefone brasileiro reconhecível", () => {
    // Melhor não casar do que casar errado: entrada suja não vira chave.
    expect(brPhoneMatchKey("")).toBeNull();
    expect(brPhoneMatchKey("123")).toBeNull();
    expect(brPhoneMatchKey("sem telefone")).toBeNull();
    expect(brPhoneMatchKey("+1 415 555 2671")).toBeNull();
  });

  it("ignora máscara, espaço e pontuação", () => {
    const esperado = brPhoneMatchKey("16992078710");
    for (const forma of ["(16) 99207-8710", "16 9 9207 8710", "+55 (16) 99207-8710"]) {
      expect(brPhoneMatchKey(forma)).toBe(esperado);
    }
  });
});
