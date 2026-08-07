import { describe, expect, it } from "vitest";

import {
  buildDailyAvailabilitySlots,
  bufferedWindow,
  scheduleRanges,
  serviceBufferOf,
  windowContains,
  windowsOverlap,
} from "../availability";
import { parseLocalDateTime } from "../time";

const dayStart = parseLocalDateTime("2032-02-10T00:00");

/** Corte às 10:00–10:40, o horário de referência dos testes de folga. */
const corte = {
  startAt: parseLocalDateTime("2032-02-10T10:00"),
  endAt: parseLocalDateTime("2032-02-10T10:40"),
};

describe("serviceBufferOf", () => {
  it("sem serviço nenhum, não exige folga", () => {
    expect(serviceBufferOf([])).toEqual({ before: 0, after: 0 });
  });

  it("usa o MAIOR valor do conjunto, não a soma", () => {
    // Corte + barba no mesmo atendimento: a limpeza acontece uma vez no fim,
    // não uma vez por serviço.
    const buffer = serviceBufferOf([
      { bufferBeforeMinutes: 5, bufferAfterMinutes: 10 },
      { bufferBeforeMinutes: 0, bufferAfterMinutes: 15 },
    ]);
    expect(buffer).toEqual({ before: 5, after: 15 });
  });
});

describe("bufferedWindow / windowsOverlap", () => {
  it("encostar não é conflitar: quem termina às 10:40 libera as 10:40", () => {
    const anterior = bufferedWindow(corte.startAt, corte.endAt);
    const seguinte = bufferedWindow(
      parseLocalDateTime("2032-02-10T10:40"),
      parseLocalDateTime("2032-02-10T11:20")
    );
    expect(windowsOverlap(anterior, seguinte)).toBe(false);
  });

  it("a folga do atendimento anterior empurra o próximo cliente", () => {
    const anterior = bufferedWindow(corte.startAt, corte.endAt, { before: 0, after: 15 });
    const seguinte = bufferedWindow(
      parseLocalDateTime("2032-02-10T10:40"),
      parseLocalDateTime("2032-02-10T11:20")
    );
    expect(windowsOverlap(anterior, seguinte)).toBe(true);
  });

  it("a folga do NOVO atendimento também conta", () => {
    const anterior = bufferedWindow(corte.startAt, corte.endAt);
    const seguinte = bufferedWindow(
      parseLocalDateTime("2032-02-10T10:40"),
      parseLocalDateTime("2032-02-10T11:20"),
      { before: 10, after: 0 }
    );
    expect(windowsOverlap(anterior, seguinte)).toBe(true);
  });

  it("com folga respeitada dos dois lados, o horário passa", () => {
    const anterior = bufferedWindow(corte.startAt, corte.endAt, { before: 0, after: 15 });
    const seguinte = bufferedWindow(
      parseLocalDateTime("2032-02-10T11:00"),
      parseLocalDateTime("2032-02-10T11:40"),
      { before: 5, after: 0 }
    );
    expect(windowsOverlap(anterior, seguinte)).toBe(false);
  });

  it("sobreposição é simétrica", () => {
    const a = bufferedWindow(corte.startAt, corte.endAt);
    const b = bufferedWindow(
      parseLocalDateTime("2032-02-10T10:20"),
      parseLocalDateTime("2032-02-10T11:00")
    );
    expect(windowsOverlap(a, b)).toBe(windowsOverlap(b, a));
    expect(windowsOverlap(a, b)).toBe(true);
  });
});

describe("buildDailyAvailabilitySlots", () => {
  it("gera 48 slots de 30 minutos por recurso", () => {
    const result = buildDailyAvailabilitySlots(dayStart, ["professional-1"], []);
    expect(result["professional-1"]).toHaveLength(48);
  });

  it("bloqueia slots sobrepostos e preserva outros recursos", () => {
    const result = buildDailyAvailabilitySlots(dayStart, ["professional-1", "professional-2"], [
      {
        resourceId: "professional-1",
        startAt: parseLocalDateTime("2032-02-10T10:00"),
        endAt: parseLocalDateTime("2032-02-10T10:30"),
      },
    ]);
    expect(result["professional-1"]?.[20]?.available).toBe(false);
    expect(result["professional-2"]?.[20]?.available).toBe(true);
  });

  it("remove slots que já começaram", () => {
    const now = parseLocalDateTime("2032-02-10T10:15");
    const result = buildDailyAvailabilitySlots(dayStart, ["professional-1"], [], 30, now)["professional-1"] ?? [];
    expect(result[20]?.available).toBe(false);
    expect(result[21]?.available).toBe(true);
  });
});

describe("scheduleRanges — expediente com pausas", () => {
  it("sem pausa, devolve a janela inteira", () => {
    expect(scheduleRanges("09:00", "18:00", null)).toEqual([{ inicio: 540, fim: 1080 }]);
  });

  it("o almoço parte o expediente em duas janelas", () => {
    expect(scheduleRanges("09:00", "18:00", [{ start: "12:00", end: "13:00" }])).toEqual([
      { inicio: 540, fim: 720 },
      { inicio: 780, fim: 1080 },
    ]);
  });

  it("aceita várias pausas, em qualquer ordem", () => {
    const r = scheduleRanges("08:00", "20:00", [
      { start: "15:00", end: "15:30" },
      { start: "12:00", end: "13:00" },
    ]);
    expect(r).toEqual([
      { inicio: 480, fim: 720 },
      { inicio: 780, fim: 900 },
      { inicio: 930, fim: 1200 },
    ]);
  });

  it("pausa que cobre o dia inteiro não deixa janela nenhuma", () => {
    expect(scheduleRanges("09:00", "18:00", [{ start: "09:00", end: "18:00" }])).toEqual([]);
  });

  it("horário inválido ou invertido não vira janela (nunca derruba a agenda)", () => {
    expect(scheduleRanges("18:00", "09:00", null)).toEqual([]);
    expect(scheduleRanges("qualquer", "18:00", null)).toEqual([]);
  });

  it("pausa malformada é ignorada em vez de quebrar", () => {
    expect(scheduleRanges("09:00", "18:00", [{ start: "xx", end: "13:00" }, "lixo", null])).toEqual([
      { inicio: 540, fim: 1080 },
    ]);
  });
});

describe("windowContains — o atendimento cabe no expediente?", () => {
  const expediente = [{ from: 540, to: 720 }, { from: 780, to: 1080 }];

  it("cabe dentro de uma janela", () => {
    expect(windowContains(expediente, { from: 600, to: 660 })).toBe(true);
  });

  it("atravessar o almoço não cabe, mesmo com as duas pontas em expediente", () => {
    expect(windowContains(expediente, { from: 700, to: 800 })).toBe(false);
  });

  it("encostar exatamente nas bordas cabe", () => {
    expect(windowContains(expediente, { from: 540, to: 720 })).toBe(true);
  });

  it("sem janela nenhuma, nada cabe", () => {
    expect(windowContains([], { from: 600, to: 660 })).toBe(false);
  });
});
