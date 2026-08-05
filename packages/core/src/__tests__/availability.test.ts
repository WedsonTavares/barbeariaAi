import { describe, expect, it } from "vitest";

import { buildDailyAvailabilitySlots } from "../availability";
import { parseLocalDateTime } from "../time";

const dayStart = parseLocalDateTime("2032-02-10T00:00");

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
