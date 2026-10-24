import { describe, expect, it } from "vitest";
import { planReschedule, differenceInDays } from "./reschedule";

const base = {
  status: "PLANNED" as const,
  currentDate: "2026-11-02",
  today: "2026-11-02",
  cycleStartDate: "2026-11-02",
  cycleEndDate: "2026-12-27",
  nextPlannedDate: "2026-11-04" as string | null,
};

describe("reschedule", () => {
  it("allows a single session before the next planned date", () => {
    const result = planReschedule({
      ...base,
      mode: "SINGLE",
      newDate: "2026-11-03",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deltaDays).toBe(1);
      expect(result.endDateBefore).toBe("2026-12-27");
      expect(result.endDateAfter).toBe("2026-12-27");
    }
  });

  it("rejects a single session that reaches the next planned date", () => {
    const equal = planReschedule({
      ...base,
      mode: "SINGLE",
      newDate: "2026-11-04",
    });
    expect(equal.ok).toBe(false);
    if (!equal.ok) expect(equal.code).toBe("ORDER_CONFLICT");

    const later = planReschedule({
      ...base,
      mode: "SINGLE",
      newDate: "2026-11-06",
    });
    expect(later.ok).toBe(false);
    if (!later.ok) expect(later.code).toBe("ORDER_CONFLICT");
  });

  it("allows a single session without a next planned session", () => {
    const result = planReschedule({
      ...base,
      nextPlannedDate: null,
      mode: "SINGLE",
      newDate: "2026-12-30",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects non-planned sessions", () => {
    for (const status of [
      "IN_PROGRESS",
      "COMPLETED",
      "SKIPPED",
      "CANCELLED",
    ] as const) {
      const result = planReschedule({
        ...base,
        status,
        mode: "SINGLE",
        newDate: "2026-11-03",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("NOT_PLANNED");
    }
  });

  it("rejects a date in the past", () => {
    const result = planReschedule({
      ...base,
      today: "2026-11-03",
      mode: "SINGLE",
      newDate: "2026-11-02",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DATE_IN_PAST");
  });

  it("rejects a date beyond the cycle end plus 14 days", () => {
    const result = planReschedule({
      ...base,
      mode: "SINGLE",
      newDate: "2027-01-11",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DATE_BEYOND_CYCLE");
  });

  it("shifts the tail and the cycle end by the same delta", () => {
    const result = planReschedule({
      ...base,
      mode: "SHIFT_TAIL",
      newDate: "2026-11-05",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deltaDays).toBe(3);
      expect(result.endDateAfter).toBe("2026-12-30");
      expect(result.extensionDays).toBe(3);
    }
  });

  it("rejects a shift that extends the cycle by more than 14 days", () => {
    const result = planReschedule({
      ...base,
      mode: "SHIFT_TAIL",
      newDate: "2026-12-30",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EXTENSION_LIMIT");
  });

  it("counts an existing extension against the 14-day limit", () => {
    const result = planReschedule({
      ...base,
      cycleEndDate: "2027-01-05",
      mode: "SHIFT_TAIL",
      newDate: "2026-11-08",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EXTENSION_LIMIT");
  });

  it("allows shifting the tail earlier", () => {
    const result = planReschedule({
      ...base,
      currentDate: "2026-11-10",
      today: "2026-11-02",
      mode: "SHIFT_TAIL",
      newDate: "2026-11-08",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deltaDays).toBe(-2);
      expect(result.endDateAfter).toBe("2026-12-25");
      expect(result.extensionDays).toBe(-2);
    }
  });

  it("rejects an end date before the cycle start", () => {
    const result = planReschedule({
      ...base,
      cycleEndDate: "2026-11-05",
      currentDate: "2026-11-15",
      today: "2026-11-02",
      mode: "SHIFT_TAIL",
      newDate: "2026-11-03",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("END_BEFORE_START");
  });

  it("rejects an invalid date", () => {
    const result = planReschedule({
      ...base,
      mode: "SINGLE",
      newDate: "2026-02-31",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DATE_IN_PAST");
  });

  it("computes signed day differences in UTC", () => {
    expect(differenceInDays("2026-03-07", "2026-03-09")).toBe(2);
    expect(differenceInDays("2026-03-09", "2026-03-07")).toBe(-2);
  });
});
