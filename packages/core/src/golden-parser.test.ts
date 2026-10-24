import { describe, expect, it } from "vitest";
import { assessSafety } from "./safety";
import { parseWorkoutText } from "./text-parser";
import { GOLDEN_PARSER_CASES } from "./golden-cases";

describe("golden parser cases", () => {
  for (const testCase of GOLDEN_PARSER_CASES) {
    it(testCase.id, () => {
      const parsed = parseWorkoutText(testCase.text);
      const safety = assessSafety({ text: testCase.text });

      expect(parsed.parsedFacts.exerciseAlias).toBe(testCase.exercise);
      expect(parsed.parsedFacts.sets).toHaveLength(testCase.sets.length);
      expect(safety.label).toBe(testCase.safety);

      testCase.sets.forEach((expected, index) => {
        const actual = parsed.parsedFacts.sets[index];
        expect(actual).toBeDefined();
        if (!actual) return;
        expect(actual.reps).toBe(expected.reps);
        if ("weightKg" in expected) {
          expect(actual.weightKg).toBe(expected.weightKg);
        }
        if ("assistanceKg" in expected) {
          expect(actual.assistanceKg).toBe(expected.assistanceKg);
        }
        if ("addedKg" in expected) {
          expect(actual.addedKg).toBe(expected.addedKg);
        }
        if ("rir" in expected) {
          expect(actual.rir).toBe(expected.rir);
        }
      });

      for (const field of testCase.missingFields ?? []) {
        expect(parsed.missingFields).toContain(field);
      }
    });
  }
});
