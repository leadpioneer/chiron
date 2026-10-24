import { describe, expect, it } from "vitest";
import {
  applyReturnLoad,
  buildPauseState,
  classifyPauseGap,
} from "./pause";

describe("pause", () => {
  it("classifies pause boundaries", () => {
    expect(classifyPauseGap(0)).toBe("NONE");
    expect(classifyPauseGap(7)).toBe("NONE");
    expect(classifyPauseGap(8)).toBe("RETURN_1");
    expect(classifyPauseGap(13)).toBe("RETURN_1");
    expect(classifyPauseGap(14)).toBe("RETURN_2");
    expect(classifyPauseGap(27)).toBe("RETURN_2");
    expect(classifyPauseGap(28)).toBe("LONG");
  });

  it("counts the pause from the cycle start when there is no exposure", () => {
    const state = buildPauseState({
      lastExposureDate: null,
      cycleStartDate: "2026-11-01",
      today: "2026-11-10",
    });
    expect(state.phase).toBe("RETURN_1");
    expect(state.days).toBe(9);
    expect(state.lastExposureDate).toBeNull();
    expect(state.returnPercent).toBe(5);
    expect(state.returnSessions).toBe(1);
    expect(state.targetRirs).toEqual([3]);
  });

  it("builds the two-session return plan", () => {
    const state = buildPauseState({
      lastExposureDate: "2026-10-20",
      cycleStartDate: "2026-10-01",
      today: "2026-11-05",
    });
    expect(state.phase).toBe("RETURN_2");
    expect(state.days).toBe(16);
    expect(state.returnPercent).toBe(10);
    expect(state.returnSessions).toBe(2);
    expect(state.targetRirs).toEqual([4, 3]);
  });

  it("requires review after 28 days", () => {
    const state = buildPauseState({
      lastExposureDate: "2026-10-01",
      cycleStartDate: "2026-09-01",
      today: "2026-10-29",
    });
    expect(state.phase).toBe("LONG");
    expect(state.returnPercent).toBeNull();
    expect(state.returnSessions).toBe(0);
  });

  it("keeps a short safety pause blocking without return", () => {
    const state = buildPauseState({
      lastExposureDate: "2026-11-01",
      cycleStartDate: "2026-10-01",
      today: "2026-11-05",
      safetyPausedAt: "2026-11-02",
    });
    expect(state.phase).toBe("SAFETY");
    expect(state.safetyDays).toBe(3);
    expect(state.returnPercent).toBeNull();
  });

  it("turns a 14-day safety pause into a review", () => {
    const state = buildPauseState({
      lastExposureDate: "2026-11-01",
      cycleStartDate: "2026-10-01",
      today: "2026-11-16",
      safetyPausedAt: "2026-11-02",
    });
    expect(state.phase).toBe("LONG");
    expect(state.reason).toBe("SAFETY");
    expect(state.safetyDays).toBe(14);
  });

  it("reduces external load by 5 and 10 percent", () => {
    const five = applyReturnLoad({
      loadMode: "EXTERNAL",
      weightKg: 100,
      assistanceKg: null,
      addedKg: null,
      incrementKg: 2.5,
      percent: 5,
    });
    expect(five.weightKg).toBe(95);

    const ten = applyReturnLoad({
      loadMode: "EXTERNAL",
      weightKg: 100,
      assistanceKg: null,
      addedKg: null,
      incrementKg: 2.5,
      percent: 10,
    });
    expect(ten.weightKg).toBe(90);
  });

  it("rounds the reduced external load down to the increment", () => {
    const result = applyReturnLoad({
      loadMode: "EXTERNAL",
      weightKg: 102.5,
      assistanceKg: null,
      addedKg: null,
      incrementKg: 2.5,
      percent: 5,
    });
    expect(result.weightKg).toBe(95);
  });

  it("adds assistance steps for the assisted variant", () => {
    const five = applyReturnLoad({
      loadMode: "ASSISTED",
      weightKg: null,
      assistanceKg: 30,
      addedKg: null,
      incrementKg: 2.5,
      percent: 5,
    });
    expect(five.assistanceKg).toBe(32.5);

    const ten = applyReturnLoad({
      loadMode: "ASSISTED",
      weightKg: null,
      assistanceKg: 30,
      addedKg: null,
      incrementKg: 2.5,
      percent: 10,
    });
    expect(ten.assistanceKg).toBe(35);
  });

  it("reduces added weight and leaves bodyweight alone", () => {
    const added = applyReturnLoad({
      loadMode: "BODYWEIGHT_PLUS",
      weightKg: null,
      assistanceKg: null,
      addedKg: 20,
      incrementKg: 2.5,
      percent: 10,
    });
    expect(added.addedKg).toBe(17.5);

    const bodyweight = applyReturnLoad({
      loadMode: "BODYWEIGHT",
      weightKg: null,
      assistanceKg: null,
      addedKg: null,
      incrementKg: 2.5,
      percent: 10,
    });
    expect(bodyweight.weightKg).toBeNull();
    expect(bodyweight.assistanceKg).toBeNull();
    expect(bodyweight.addedKg).toBeNull();
  });

  it("does not invent a load for a missing weight", () => {
    const result = applyReturnLoad({
      loadMode: "EXTERNAL",
      weightKg: null,
      assistanceKg: null,
      addedKg: null,
      incrementKg: 2.5,
      percent: 5,
    });
    expect(result.weightKg).toBeNull();
  });
});
