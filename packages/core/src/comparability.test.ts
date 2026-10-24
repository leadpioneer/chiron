import { describe, expect, it } from "vitest";
import { areComparable, daysBetween } from "./comparability";

const base = {
  exerciseVariantId: "bench",
  equipmentSettingsHash: "default",
  loadMode: "EXTERNAL" as const,
  technique: "NORMAL" as const,
  duringDeload: false,
  duringReturn: false,
};

describe("comparability", () => {
  it("compares the same variant within the window", () => {
    expect(
      areComparable(
        { ...base, date: "2026-10-01" },
        { ...base, date: "2026-10-20" },
      ),
    ).toBe(true);
  });

  it("rejects a different variant", () => {
    expect(
      areComparable(
        { ...base, date: "2026-10-01" },
        { ...base, exerciseVariantId: "smith", date: "2026-10-02" },
      ),
    ).toBe(false);
  });

  it("rejects exposures outside the window", () => {
    expect(
      areComparable(
        { ...base, date: "2026-07-01" },
        { ...base, date: "2026-10-01" },
      ),
    ).toBe(false);
  });

  it("rejects deload, return and limit technique", () => {
    expect(
      areComparable(
        { ...base, date: "2026-10-01", duringDeload: true },
        { ...base, date: "2026-10-02" },
      ),
    ).toBe(false);
    expect(
      areComparable(
        { ...base, date: "2026-10-01", duringReturn: true },
        { ...base, date: "2026-10-02" },
      ),
    ).toBe(false);
    expect(
      areComparable(
        { ...base, date: "2026-10-01", technique: "LIMIT" },
        { ...base, date: "2026-10-02" },
      ),
    ).toBe(false);
  });

  it("computes absolute day distance", () => {
    expect(daysBetween("2026-10-01", "2026-10-03")).toBe(2);
    expect(daysBetween("bad", "2026-10-03")).toBeNull();
  });
});
