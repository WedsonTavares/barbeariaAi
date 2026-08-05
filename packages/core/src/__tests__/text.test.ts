import { describe, expect, it } from "vitest";

import { matchesCatalogName } from "../text";

describe("matchesCatalogName", () => {
  it("normaliza acento, maiúscula e hífen", () => {
    expect(matchesCatalogName("Corte masculino", "corte")).toBe(true);
    expect(matchesCatalogName("Design de sobrancelha", "sobrancelha")).toBe(true);
  });

  it("tolera um typo simples", () => {
    expect(matchesCatalogName("Corte", "crote")).toBe(true);
  });

  it("não bate com serviço diferente", () => {
    expect(matchesCatalogName("Barba", "manicure")).toBe(false);
  });
});
