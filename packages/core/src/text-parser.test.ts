import { describe, expect, it } from "vitest";
import { parseWorkoutText } from "./text-parser";

describe("local parser", () => {
  it("parses weight, reps and RIR", () => {
    const result = parseWorkoutText("жим 70 на 8, RIR 2");
    expect(result.parsedFacts.exerciseAlias).toBe("жим лёжа");
    expect(result.parsedFacts.sets[0]).toMatchObject({
      weightKg: 70,
      reps: 8,
      rir: 2,
    });
  });

  it("parses sets by reps", () => {
    const result = parseWorkoutText("3х8 70 кг");
    expect(result.parsedFacts.sets).toHaveLength(3);
    expect(result.parsedFacts.sets[0]?.weightKg).toBe(70);
    expect(result.parsedFacts.sets[0]?.reps).toBe(8);
  });

  it("parses a rep sequence and assistance", () => {
    const result = parseWorkoutText("подтягивания 6/5/5, помощь 30");
    expect(result.parsedFacts.sets).toHaveLength(3);
    expect(result.parsedFacts.sets.map((set) => set.reps)).toEqual([6, 5, 5]);
    expect(result.parsedFacts.sets[0]?.assistanceKg).toBe(30);
  });

  it("parses sleep and red flags", () => {
    const result = parseWorkoutText("спал 5, болит в груди");
    expect(result.parsedFacts.sleepHours).toBe(5);
    expect(result.safetyObservations[0]?.code).toBe("RED");
  });

  it("reports missing fields instead of inventing data", () => {
    const result = parseWorkoutText("сделал жим");
    expect(result.missingFields).toContain("sets");
    expect(result.parsedFacts.sets).toHaveLength(0);
  });
});
