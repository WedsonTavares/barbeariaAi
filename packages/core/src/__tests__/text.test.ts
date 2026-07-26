import { describe, expect, it } from "vitest";
import { matchesToyName } from "../text";

describe("matchesToyName", () => {
  it("bate exato, ignorando acento/maiúscula/hífen (normalizeMatchTerm)", () => {
    expect(matchesToyName("Pula-pula Aranha", "pula pula aranha")).toBe(true);
  });

  it("bate quando um nome contém o outro", () => {
    expect(matchesToyName("Pula Pula 3m", "pula pula")).toBe(true);
    expect(matchesToyName("Pula Pula", "pula pula 3 metros")).toBe(true);
  });

  it("tolera 1 letra faltando/trocada por palavra (caso real: cliente digitou 'pula ula')", () => {
    expect(matchesToyName("Pula Pula 3m", "pula ula")).toBe(true);
  });

  it("não bate com brinquedo totalmente diferente", () => {
    expect(matchesToyName("Cama Elástica Pro", "piscina de bolinhas")).toBe(false);
  });

  it("não bate com termo vazio", () => {
    expect(matchesToyName("Pula Pula 3m", "")).toBe(false);
  });

  it("não deixa passar qualquer coisa: palavra muito curta não tolera troca", () => {
    // "3m" tem 2 chars — a regra de tolerância exige >=3 pra não virar bate-tudo.
    expect(matchesToyName("Pula Pula 3m", "pula pula 5x")).toBe(false);
  });
});
