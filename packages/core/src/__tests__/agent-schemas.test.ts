import { describe, expect, it } from "vitest";
import {
  agentAvailabilityInput,
  agentBookingCancelInput,
  agentBookingInput,
  agentBookingRescheduleInput,
  agentContextInput,
  agentLookupInput,
} from "../schemas";

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

  it("aceita retirada às 24:00, mas nunca montagem às 24:00", () => {
    expect(
      agentBookingInput.safeParse({
        phone: "5516999999999",
        name: "Cliente Teste",
        date: "2026-09-24",
        setupTime: "20:00",
        pickupTime: "24:00",
        toys: ["Pula-pula Aranha"],
      }).success
    ).toBe(true);
    expect(
      agentBookingInput.safeParse({
        phone: "5516999999999",
        name: "Cliente Teste",
        date: "2026-09-24",
        setupTime: "24:00",
        pickupTime: "24:00",
        toys: ["Pula-pula Aranha"],
      }).success
    ).toBe(false);
  });

  it("limpa o telefone de caracteres que não são dígito (caso real: tab colado pelo n8n)", () => {
    // Um input do "Executar: Pós-festa" veio com "\t5516992331680": a busca por
    // telefone exato no banco não achava a conversa, e a ferramenta respondia
    // ok:true sem ter feito nada — falso positivo silencioso.
    const parsed = agentLookupInput.parse({ phone: "\t5516992331680" });
    expect(parsed.phone).toBe("5516992331680");

    const withSpaces = agentBookingInput.safeParse({
      phone: " 5516999999999 ",
      name: "Cliente Teste",
      date: "2026-09-24",
      setupTime: "14:00",
      pickupTime: "18:00",
      toys: ["Pula-pula Aranha"],
    });
    expect(withSpaces.success).toBe(true);
    if (withSpaces.success) expect(withSpaces.data.phone).toBe("5516999999999");
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

  it("aceita grade opt-in de slots de 30 minutos", () => {
    const parsed = agentAvailabilityInput.parse({
      date: "2026-09-24",
      slotMinutes: 30,
      toyName: "Pula-pula Aranha",
    });

    expect(parsed.slotMinutes).toBe(30);
    expect(parsed.setupTime).toBeUndefined();
    expect(parsed.pickupTime).toBeUndefined();
  });

  it("mantém a consulta legada por dia e aceita 30 textual do n8n", () => {
    const legacy = agentAvailabilityInput.parse({
      date: "2026-09-24",
      toyName: "Pula-pula Aranha",
    });
    const slots = agentAvailabilityInput.parse({
      date: "2026-09-24",
      slotMinutes: "30",
    });

    expect(legacy.slotMinutes).toBeUndefined();
    expect(slots.slotMinutes).toBe(30);
  });

  it("trata horários vazios do n8n como ausentes no modo de slots", () => {
    const parsed = agentAvailabilityInput.parse({
      date: "2026-09-24",
      setupTime: "",
      pickupTime: "",
      slotMinutes: 30,
    });

    expect(parsed.setupTime).toBeUndefined();
    expect(parsed.pickupTime).toBeUndefined();
  });

  it("rejeita slot diferente de 30 minutos ou combinado com intervalo exato", () => {
    expect(
      agentAvailabilityInput.safeParse({
        date: "2026-09-24",
        slotMinutes: 15,
      }).success
    ).toBe(false);
    expect(
      agentAvailabilityInput.safeParse({
        date: "2026-09-24",
        setupTime: "14:00",
        pickupTime: "18:00",
        slotMinutes: 30,
      }).success
    ).toBe(false);
  });

  it("aceita reagendamento mínimo e normaliza o telefone", () => {
    const parsed = agentBookingRescheduleInput.parse({
      bookingId: "b4c8db19-45db-4e11-bcf4-c372f2b4cb15",
      phone: " +55 (16) 99233-1680 ",
      date: "2026-09-25",
      setupTime: "15:30",
      pickupTime: "19:30",
    });

    expect(parsed.phone).toBe("5516992331680");
    expect(parsed.setupTime).toBe("15:30");
    expect(parsed.pickupTime).toBe("19:30");
  });

  it("rejeita reagendamento invertido e cancelamento sem confirmação explícita", () => {
    expect(
      agentBookingRescheduleInput.safeParse({
        bookingId: "b4c8db19-45db-4e11-bcf4-c372f2b4cb15",
        phone: "5516992331680",
        date: "2026-09-25",
        setupTime: "19:30",
        pickupTime: "15:30",
      }).success
    ).toBe(false);
    expect(
      agentBookingCancelInput.safeParse({
        bookingId: "b4c8db19-45db-4e11-bcf4-c372f2b4cb15",
        phone: "5516992331680",
        confirmed: false,
      }).success
    ).toBe(false);
  });

  it("normaliza e limita a busca de contexto do n8n", () => {
    const parsed = agentContextInput.parse({ phone: " +55 (16) 99233-1680 " });

    expect(parsed.phone).toBe("5516992331680");
    expect(parsed.limit).toBe(80);
    expect(agentContextInput.safeParse({ phone: "sem telefone", limit: 101 }).success).toBe(false);
  });
});
