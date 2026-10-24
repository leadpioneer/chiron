import { describe, expect, it } from "vitest";
import {
  cycleEndDate,
  generateSessionSchedule,
  generateWeekdaySchedule,
} from "./schedule";

describe("schedule", () => {
  it("builds every-other-day sessions across 8 weeks", () => {
    const schedule = generateSessionSchedule(
      "2026-11-02",
      "EVERY_OTHER_DAY",
    );
    expect(schedule).toHaveLength(28);
    expect(schedule[0]).toMatchObject({
      sessionIndex: 0,
      sessionKey: "A",
      plannedDate: "2026-11-02",
    });
    expect(schedule[1]).toMatchObject({
      sessionIndex: 1,
      sessionKey: "B",
      plannedDate: "2026-11-04",
    });
    expect(schedule[27]?.plannedDate).toBe("2026-12-26");
  });

  it("builds the 5-day train-rest-train-rest-rest cycle", () => {
    const schedule = generateSessionSchedule("2026-11-02", "FIVE_DAY_CYCLE");
    expect(schedule).toHaveLength(23);
    expect(schedule.slice(0, 5).map((item) => item.plannedDate)).toEqual([
      "2026-11-02",
      "2026-11-04",
      "2026-11-07",
      "2026-11-09",
      "2026-11-12",
    ]);
    expect(schedule[22]?.plannedDate).toBe("2026-12-27");
  });

  it("ends the cycle 8 weeks after the start", () => {
    expect(cycleEndDate("2026-11-02")).toBe("2026-12-27");
  });

  it("keeps weekday scheduling available for 3+ day splits", () => {
    const schedule = generateWeekdaySchedule("2026-11-02", [1, 4]);
    expect(schedule).toHaveLength(16);
    expect(schedule[0]?.plannedDate).toBe("2026-11-02");
    expect(schedule[1]?.plannedDate).toBe("2026-11-05");
  });
});
