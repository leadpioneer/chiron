import { describe, expect, it } from "vitest";
import {
  applyCycleMultiplier,
  rebuildMultiplierForDays,
  RETURN_PHASE_SESSIONS,
} from "./cycle-review";

describe("cycle review", () => {
  it("uses the four-session return phase", () => {
    expect(RETURN_PHASE_SESSIONS).toBe(4);
  });

  it("maps pause length to the rebuild multiplier", () => {
    expect(rebuildMultiplierForDays(0)).toBe(1);
    expect(rebuildMultiplierForDays(13)).toBe(1);
    expect(rebuildMultiplierForDays(14)).toBe(0.9);
    expect(rebuildMultiplierForDays(28)).toBe(0.9);
    expect(rebuildMultiplierForDays(42)).toBe(0.9);
    expect(rebuildMultiplierForDays(43)).toBe(0.8);
    expect(rebuildMultiplierForDays(84)).toBe(0.8);
    expect(rebuildMultiplierForDays(85)).toBe(0.7);
    expect(rebuildMultiplierForDays(168)).toBe(0.7);
    expect(rebuildMultiplierForDays(169)).toBeNull();
  });

  it("scales external loads and rounds down", () => {
    const result = applyCycleMultiplier(
      {
        loadMode: "EXTERNAL",
        weightKg: 102.5,
        assistanceKg: null,
        addedKg: null,
        incrementKg: 2.5,
      },
      0.9,
    );
    expect(result.weightKg).toBe(90);
  });

  it("adds assistance steps for assisted variants", () => {
    const result = applyCycleMultiplier(
      {
        loadMode: "ASSISTED",
        weightKg: null,
        assistanceKg: 30,
        addedKg: null,
        incrementKg: 2.5,
      },
      0.8,
    );
    expect(result.assistanceKg).toBe(40);
  });

  it("calibrates instead of guessing when the pause is too long", () => {
    const result = applyCycleMultiplier(
      {
        loadMode: "EXTERNAL",
        weightKg: 100,
        assistanceKg: null,
        addedKg: null,
        incrementKg: 2.5,
      },
      null,
    );
    expect(result.weightKg).toBeNull();
  });
});
