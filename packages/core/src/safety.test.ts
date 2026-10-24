import { describe, expect, it } from "vitest";
import { assessSafety, mergeSafetyAssessments } from "./safety";

describe("safety", () => {
  it("marks chest pain as red and pauses", () => {
    const result = assessSafety({ text: "болит в груди" });
    expect(result.label).toBe("RED");
    expect(result.pause).toBe(true);
    expect(result.escalate).toBe(true);
  });

  it("does not treat a normal shoulder mention as pain", () => {
    const result = assessSafety({ text: "плечо норм, пожал легко" });
    expect(result.label).toBe("GREEN");
  });

  it("marks pain as yellow", () => {
    const result = assessSafety({ text: "болит плечо на жиме" });
    expect(result.label).toBe("YELLOW_PAIN");
    expect(result.blockProgression).toBe(true);
  });

  it("does not confuse 'больше' with pain", () => {
    const result = assessSafety({ text: "сделал больше повторов" });
    expect(result.label).toBe("GREEN");
  });

  it("marks illness signs as yellow illness", () => {
    const result = assessSafety({ text: "болит горло и температура" });
    expect(result.label).toBe("YELLOW_ILLNESS");
  });

  it("marks low sleep and high fatigue as systemic", () => {
    const result = assessSafety({
      text: "",
      wellness: {
        sleepHours: 4.5,
        sleepQuality: 2,
        fatigue: 5,
        stress: 3,
        motivation: 3,
        soreness: "NONE",
        symptom: false,
        symptomText: null,
        illness: "NONE",
      },
    });
    expect(result.label).toBe("YELLOW_SYSTEMIC");
    expect(result.blockProgression).toBe(true);
  });

  it("merges a model safety signal without downgrading the local one", () => {
    const local = assessSafety({ text: "плечо болит" });
    const model = {
      label: "RED" as const,
      reasons: ["модель увидела красный флаг"],
      blockProgression: true,
      pause: true,
      escalate: true,
    };
    const merged = mergeSafetyAssessments(local, model);
    expect(merged.label).toBe("RED");
    expect(merged.pause).toBe(true);
    expect(merged.reasons.length).toBeGreaterThan(1);
  });

  it("keeps a normal check green", () => {
    const result = assessSafety({
      text: "",
      wellness: {
        sleepHours: 7,
        sleepQuality: 4,
        fatigue: 2,
        stress: 2,
        motivation: 4,
        soreness: "NONE",
        symptom: false,
        symptomText: null,
        illness: "NONE",
      },
    });
    expect(result.label).toBe("GREEN");
  });
});
