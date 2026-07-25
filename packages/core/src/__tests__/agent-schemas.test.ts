import { describe, expect, it } from "vitest";
import { agentAvailabilityInput, agentBookingInput } from "../schemas";

describe("schemas das ferramentas de agenda", () => {
  it("aceita disponibilidade para um intervalo exato", () => {
    const parsed = agentAvailabilityInput.parse({
      date: "2026-09-24",
      setupTime: "14:00",
      pickupTime: "18:00",
      toyName: "Pula-pula Aranha",
    });

    expect(parsed.setupTime).toBe("14:00");
    expect(parsed.pickupTime).toBe("18:00");
  });

  it("rejeita disponibilidade com apenas um dos horários", () => {
    const parsed = agentAvailabilityInput.safeParse({
      date: "2026-09-24",
      setupTime: "14:00",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejeita retirada anterior ou igual à montagem", () => {
    const parsed = agentAvailabilityInput.safeParse({
      date: "2026-09-24",
      setupTime: "18:00",
      pickupTime: "14:00",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejeita horários que apenas parecem HH:mm", () => {
    const parsed = agentBookingInput.safeParse({
      phone: "5516999999999",
      name: "Cliente Teste",
      date: "2026-09-24",
      setupTime: "29:70",
      pickupTime: "30:80",
      toys: ["Pula-pula Aranha"],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejeita uma data que o JavaScript normalizaria para outro dia", () => {
    expect(
      agentAvailabilityInput.safeParse({
        date: "2026-02-31",
        setupTime: "14:00",
        pickupTime: "18:00",
      }).success
    ).toBe(false);
    expect(
      agentBookingInput.safeParse({
        phone: "5516999999999",
        name: "Cliente Teste",
        date: "2026-02-31",
        setupTime: "14:00",
        pickupTime: "18:00",
        toys: ["Pula-pula Aranha"],
      }).success
    ).toBe(false);
  });
});
