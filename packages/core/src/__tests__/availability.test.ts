import { describe, expect, it } from "vitest";
import { buildDailyAvailabilitySlots } from "../availability";
import { parseLocalDate, parseLocalDateTime } from "../time";

describe("grade de disponibilidade", () => {
  const dayStart = parseLocalDate("2026-09-24");

  it("gera 48 slots de 30 minutos para um dia livre", () => {
    const result = buildDailyAvailabilitySlots(dayStart, ["toy-1"], []);
    expect(result["toy-1"]).toHaveLength(48);
    expect(result["toy-1"]?.[0]).toEqual({
      startTime: "00:00",
      endTime: "00:30",
      available: true,
    });
    expect(result["toy-1"]?.[47]).toEqual({
      startTime: "23:30",
      endTime: "24:00",
      available: true,
    });
  });

  it("bloqueia somente os slots que sobrepõem uma reserva", () => {
    const result = buildDailyAvailabilitySlots(dayStart, ["toy-1"], [
      {
        toyId: "toy-1",
        setupTime: parseLocalDateTime("2026-09-24T14:00"),
        pickupTime: parseLocalDateTime("2026-09-24T18:00"),
      },
    ]);
    const slots = result["toy-1"] ?? [];

    expect(slots.find((slot) => slot.startTime === "13:30")?.available).toBe(true);
    expect(slots.find((slot) => slot.startTime === "14:00")?.available).toBe(false);
    expect(slots.find((slot) => slot.startTime === "17:30")?.available).toBe(false);
    expect(slots.find((slot) => slot.startTime === "18:00")?.available).toBe(true);
  });

  it("bloqueia dois slots quando uma reserva atravessa a divisão de meia hora", () => {
    const result = buildDailyAvailabilitySlots(dayStart, ["toy-1"], [
      {
        toyId: "toy-1",
        setupTime: parseLocalDateTime("2026-09-24T14:15"),
        pickupTime: parseLocalDateTime("2026-09-24T14:45"),
      },
    ]);
    const blocked = (result["toy-1"] ?? []).filter((slot) => !slot.available);

    expect(blocked.map((slot) => slot.startTime)).toEqual(["14:00", "14:30"]);
  });

  it("esconde os slots que já começaram quando a consulta é do dia corrente", () => {
    const agora = parseLocalDateTime("2026-09-24T19:10");
    const slots =
      buildDailyAvailabilitySlots(dayStart, ["toy-1"], [], 30, agora)["toy-1"] ?? [];

    expect(slots.find((slot) => slot.startTime === "08:00")?.available).toBe(false);
    expect(slots.find((slot) => slot.startTime === "19:00")?.available).toBe(false);
    expect(slots.find((slot) => slot.startTime === "19:30")?.available).toBe(true);
  });

  it("não corta nada quando o dia consultado ainda nem começou", () => {
    const agora = parseLocalDateTime("2026-09-23T19:10");
    const slots =
      buildDailyAvailabilitySlots(dayStart, ["toy-1"], [], 30, agora)["toy-1"] ?? [];

    expect(slots.every((slot) => slot.available)).toBe(true);
  });

  it("mantém conflitos separados por brinquedo", () => {
    const result = buildDailyAvailabilitySlots(dayStart, ["toy-1", "toy-2"], [
      {
        toyId: "toy-1",
        setupTime: parseLocalDateTime("2026-09-24T10:00"),
        pickupTime: parseLocalDateTime("2026-09-24T10:30"),
      },
    ]);

    expect(result["toy-1"]?.[20]?.available).toBe(false);
    expect(result["toy-2"]?.[20]?.available).toBe(true);
  });
});
