import { describe, expect, it } from "vitest";
import {
  isDeclining,
  recommendProgression,
  recommendSession,
} from "./progression";
import type {
  Exposure,
  PrescriptionSnapshot,
  SafetyAssessment,
  SetRecord,
  WellnessSnapshot,
} from "./types";

function prescription(
  overrides: Partial<PrescriptionSnapshot> = {},
): PrescriptionSnapshot {
  return {
    id: "p1",
    exerciseVariantId: "bench",
    exerciseName: "Жим лёжа",
    role: "PRIMARY",
    targetBlockKey: "press",
    targetBlockName: "Жимовое направление",
    supportsPrimaryId: null,
    plannedOrder: 0,
    optional: false,
    sets: 3,
    repMin: 5,
    repMax: 8,
    targetReps: 5,
    targetRir: 2,
    loadMode: "EXTERNAL",
    weightKg: 70,
    assistanceKg: null,
    addedKg: null,
    incrementKg: 2.5,
    pair: false,
    sides: 1,
    ...overrides,
  };
}

function set(
  reps: number,
  overrides: Partial<SetRecord> = {},
): SetRecord {
  return {
    setType: "WORKING",
    weightKg: 70,
    assistanceKg: null,
    addedKg: null,
    reps,
    rir: 2,
    technique: "NORMAL",
    completed: true,
    actualOrder: 0,
    ...overrides,
  };
}

function exposure(
  reps: number[],
  options: {
    rir?: number | null;
    weight?: number | null;
    assistance?: number | null;
    date?: string;
    id?: string;
    targetReps?: number;
  } = {},
): Exposure {
  const weight = options.weight === undefined ? 70 : options.weight;
  const assistance = options.assistance ?? null;
  return {
    id: options.id ?? `e-${Math.random()}`,
    date: options.date ?? "2026-10-20",
    sets: reps.map((value, index) =>
      set(value, {
        rir: options.rir === undefined ? 2 : options.rir,
        weightKg: weight,
        assistanceKg: assistance,
        actualOrder: index,
      }),
    ),
    plannedSets: reps.length,
    plannedRepMin: 5,
    plannedRepMax: 8,
    targetReps: options.targetReps ?? 5,
    targetRir: 2,
  };
}

const green: SafetyAssessment = {
  label: "GREEN",
  reasons: [],
  blockProgression: false,
  pause: false,
  escalate: false,
};

const wellness: WellnessSnapshot = {
  sleepHours: 7,
  sleepQuality: 4,
  fatigue: 2,
  stress: 2,
  motivation: 4,
  soreness: "NONE",
  symptom: false,
  symptomText: null,
  illness: "NONE",
};

describe("progression", () => {
  it("holds without comparable data", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [],
      safety: green,
    });
    expect(result.action).toBe("HOLD");
    expect(result.ruleIds).toContain("NO_COMPARABLE_DATA");
  });

  it("progresses load after top of range with RIR 3", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([8, 8, 8], { rir: 3 })],
      safety: green,
    });
    expect(result.action).toBe("PROGRESS");
    expect(result.changes[0]?.weightKg).toBe(72.5);
    expect(result.changes[0]?.targetReps).toBe(5);
  });

  it("requires confirmation at RIR 2", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([8, 8, 8], { rir: 2 })],
      safety: green,
    });
    expect(result.action).toBe("HOLD");
    expect(result.ruleIds).toContain("LOAD_CONFIRMATION_REQUIRED");
  });

  it("progresses load after two top-range exposures at RIR 2", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [
        exposure([8, 8, 8], { rir: 2, id: "latest" }),
        exposure([8, 8, 8], { rir: 2, id: "previous" }),
      ],
      safety: green,
    });
    expect(result.action).toBe("PROGRESS");
    expect(result.changes[0]?.weightKg).toBe(72.5);
  });

  it("progresses reps before load", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([6, 6, 6], { rir: 2 })],
      safety: green,
    });
    expect(result.action).toBe("PROGRESS");
    expect(result.changes[0]?.targetReps).toBe(6);
    expect(result.changes[0]?.weightKg).toBeUndefined();
  });

  it("does not treat a load reset as a decline", () => {
    const result = recommendProgression({
      prescription: prescription({ targetReps: 5 }),
      exposures: [
        exposure([5, 5, 5], { rir: 2, targetReps: 5, id: "latest" }),
        exposure([8, 8, 8], { rir: 2, targetReps: 8, id: "previous" }),
      ],
      safety: green,
    });
    expect(result.action).toBe("PROGRESS");
    expect(result.changes[0]?.targetReps).toBe(6);
  });

  it("holds when RIR is below target", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([8, 8, 8], { rir: 1 })],
      safety: green,
    });
    expect(result.action).toBe("HOLD");
    expect(result.ruleIds).toContain("RIR_BELOW_TARGET");
  });

  it("holds when a set is missing", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([8, 8])],
      safety: green,
    });
    expect(result.action).toBe("HOLD");
    expect(result.ruleIds).toContain("INCOMPLETE_SETS");
  });

  it("reduces load after a comparable decline", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [
        exposure([5, 5, 5], { id: "latest" }),
        exposure([7, 7, 7], { id: "previous" }),
      ],
      safety: green,
    });
    expect(result.action).toBe("LOCAL_REDUCE");
    expect(result.changes[0]?.weightKg).toBe(67.5);
  });

  it("holds on pain without a decline", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([8, 8, 8], { rir: 3 })],
      safety: { ...green, label: "YELLOW_PAIN", blockProgression: true },
    });
    expect(result.action).toBe("HOLD");
    expect(result.ruleIds).toContain("SAFETY_YELLOW");
  });

  it("reduces on pain with a decline", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [
        exposure([5, 5, 5], { id: "latest" }),
        exposure([7, 7, 7], { id: "previous" }),
      ],
      safety: { ...green, label: "YELLOW_PAIN", blockProgression: true },
    });
    expect(result.action).toBe("LOCAL_REDUCE");
  });

  it("pauses on a red flag", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([8, 8, 8])],
      safety: {
        ...green,
        label: "RED",
        blockProgression: true,
        pause: true,
        escalate: true,
      },
    });
    expect(result.action).toBe("PAUSE");
    expect(result.ruleIds).toContain("SAFETY_RED");
  });

  it("calibrates a missing starting load from the performed sets", () => {
    const result = recommendProgression({
      prescription: prescription({ weightKg: null }),
      exposures: [exposure([8, 8, 8], { weight: 40 })],
      safety: green,
    });
    expect(result.action).toBe("PROGRESS");
    expect(result.ruleIds).toContain("CALIBRATION_BASELINE");
    expect(result.changes[0]?.weightKg).toBe(40);
  });

  it("adds an accessory set before load", () => {
    const result = recommendProgression({
      prescription: prescription({
        role: "ACCESSORY",
        sets: 2,
        repMin: 8,
        repMax: 12,
        targetReps: 12,
        weightKg: 40,
      }),
      exposures: [
        exposure([12, 12], { rir: 3, weight: 40, id: "latest" }),
        exposure([12, 12], { rir: 3, weight: 40, id: "previous" }),
      ],
      safety: green,
    });
    expect(result.action).toBe("PROGRESS");
    expect(result.changes[0]?.sets).toBe(3);
    expect(result.changes[0]?.weightKg).toBeUndefined();
  });

  it("holds at the top of a bodyweight range", () => {
    const result = recommendProgression({
      prescription: prescription({
        loadMode: "BODYWEIGHT",
        weightKg: null,
      }),
      exposures: [exposure([8, 8, 8], { rir: 3, weight: null })],
      safety: green,
    });
    expect(result.action).toBe("HOLD");
    expect(result.ruleIds).toContain("LOAD_CEILING");
  });

  it("progresses reps without RIR but never load", () => {
    const reps = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([6, 6, 6], { rir: null })],
      safety: green,
    });
    expect(reps.action).toBe("PROGRESS");
    expect(reps.changes[0]?.targetReps).toBe(6);

    const top = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([8, 8, 8], { rir: null })],
      safety: green,
    });
    expect(top.action).toBe("HOLD");
    expect(top.ruleIds).toContain("RIR_MISSING");
  });

  it("proposes a scoped deload when two primaries decline with systemic fatigue", () => {
    const drafts = recommendSession({
      sessionId: "session-1",
      wellness: { ...wellness, fatigue: 5, sleepHours: 5 },
      sessionRpe: "MAX",
      primaries: [
        {
          prescription: prescription({ id: "bench", targetBlockKey: "press" }),
          exposures: [
            exposure([5, 5, 5], { id: "b-latest" }),
            exposure([7, 7, 7], { id: "b-prev" }),
          ],
        },
        {
          prescription: prescription({
            id: "squat",
            targetBlockKey: "squat",
            exerciseName: "Присед",
          }),
          exposures: [
            exposure([5, 5, 5], { id: "s-latest" }),
            exposure([7, 7, 7], { id: "s-prev" }),
          ],
        },
      ],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.action).toBe("DELOAD");
    expect(drafts[0]?.changes).toHaveLength(2);
    expect(drafts[0]?.scopeType).toBe("SESSION");
  });

  it("does not propagate a red flag into per-exercise progress", () => {
    const drafts = recommendSession({
      sessionId: "session-1",
      wellness,
      sessionRpe: "MODERATE",
      safety: {
        ...green,
        label: "RED",
        blockProgression: true,
        pause: true,
        escalate: true,
      },
      primaries: [
        {
          prescription: prescription(),
          exposures: [exposure([8, 8, 8], { rir: 3 })],
        },
      ],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.action).toBe("PAUSE");
    expect(drafts[0]?.scopeType).toBe("SESSION");
  });

  it("holds during the return phase even at the top of the range", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([8, 8, 8], { rir: 3 })],
      safety: green,
      returnPhase: true,
    });
    expect(result.action).toBe("HOLD");
    expect(result.ruleIds).toContain("RETURN_PHASE");
    expect(result.changes).toHaveLength(0);
  });

  it("keeps safety priority during the return phase", () => {
    const result = recommendProgression({
      prescription: prescription(),
      exposures: [exposure([8, 8, 8], { rir: 3 })],
      safety: {
        ...green,
        label: "RED",
        blockProgression: true,
        pause: true,
        escalate: true,
      },
      returnPhase: true,
    });
    expect(result.action).toBe("PAUSE");
    expect(result.ruleIds).toContain("SAFETY_RED");
  });

  it("does not compare return exposures with normal ones as a decline", () => {
    const returnExposure = exposure([5, 5, 5], {
      id: "return",
    });
    returnExposure.duringReturn = true;
    const normalExposure = exposure([8, 8, 8], { id: "normal" });
    expect(isDeclining([returnExposure, normalExposure])).toBe(false);
    expect(
      isDeclining([
        { ...returnExposure, id: "return-2" },
        { ...returnExposure, id: "return-1" },
      ]),
    ).toBe(false);
  });

  it("does not deload during the return phase", () => {
    const drafts = recommendSession({
      sessionId: "session-1",
      wellness: { ...wellness, fatigue: 5, sleepHours: 5 },
      sessionRpe: "MAX",
      safety: green,
      returnPhase: true,
      primaries: [
        {
          prescription: prescription({ id: "bench", targetBlockKey: "press" }),
          exposures: [
            exposure([5, 5, 5], { id: "b-latest" }),
            exposure([7, 7, 7], { id: "b-prev" }),
          ],
        },
        {
          prescription: prescription({
            id: "squat",
            targetBlockKey: "squat",
            exerciseName: "Присед",
          }),
          exposures: [
            exposure([5, 5, 5], { id: "s-latest" }),
            exposure([7, 7, 7], { id: "s-prev" }),
          ],
        },
      ],
    });
    expect(drafts.map((draft) => draft.action)).toEqual(["HOLD", "HOLD"]);
    expect(drafts.every((draft) => draft.ruleIds.includes("RETURN_PHASE"))).toBe(
      true,
    );
  });

  it("keeps two primaries independent", () => {
    const drafts = recommendSession({
      sessionId: "session-1",
      wellness,
      sessionRpe: "MODERATE",
      primaries: [
        {
          prescription: prescription({ id: "bench" }),
          exposures: [exposure([8, 8, 8], { rir: 3 })],
        },
        {
          prescription: prescription({ id: "squat" }),
          exposures: [exposure([8, 8, 8], { rir: 1 })],
        },
      ],
    });
    const bench = drafts.find((draft) => draft.scopeId === "bench");
    const squat = drafts.find((draft) => draft.scopeId === "squat");
    expect(bench?.action).toBe("PROGRESS");
    expect(squat?.action).toBe("HOLD");
  });

  it("lowers only the painful exercise to a tolerated weight", () => {
    const painSafety: SafetyAssessment = {
      label: "YELLOW_PAIN",
      reasons: ["Есть боль или дискомфорт."],
      blockProgression: true,
      pause: false,
      escalate: false,
    };
    const greenSafety: SafetyAssessment = {
      label: "GREEN",
      reasons: [],
      blockProgression: false,
      pause: false,
      escalate: false,
    };
    const painfulRow: Exposure = {
      id: "row-latest",
      date: "2026-10-26",
      plannedSets: 2,
      plannedRepMin: 8,
      plannedRepMax: 10,
      targetReps: 8,
      targetRir: 1,
      sets: [
        set(8, { weightKg: 59, rir: 0, pain: true, actualOrder: 0 }),
        set(10, { weightKg: 52, rir: 1, pain: false, actualOrder: 1 }),
      ],
    };
    const bench = prescription({
      id: "bench",
      weightKg: null,
      role: "PRIMARY",
      targetBlockKey: "press",
    });
    const row = prescription({
      id: "row",
      weightKg: null,
      role: "ACCESSORY",
      targetBlockKey: "pull",
      exerciseName: "Горизонтальная тяга",
      sets: 2,
      repMin: 8,
      repMax: 10,
      targetReps: 8,
      targetRir: 1,
    });

    const drafts = recommendSession({
      sessionId: "session-pain",
      wellness,
      sessionRpe: "MODERATE",
      safety: greenSafety,
      primaries: [
        {
          prescription: bench,
          exposures: [exposure([5, 5, 5], { weight: 70, rir: 2 })],
          safety: greenSafety,
        },
        {
          prescription: row,
          exposures: [painfulRow],
          safety: painSafety,
        },
      ],
    });

    const benchDraft = drafts.find((draft) => draft.scopeId === "bench");
    const rowDraft = drafts.find((draft) => draft.scopeId === "row");
    expect(benchDraft?.action).toBe("PROGRESS");
    expect(benchDraft?.ruleIds).toContain("CALIBRATION_BASELINE");
    expect(rowDraft?.action).toBe("LOCAL_REDUCE");
    expect(rowDraft?.changes).toEqual([
      { prescriptionId: "row", weightKg: 52 },
    ]);
    expect(rowDraft?.ruleIds).toContain("LOCAL_PAIN_REDUCE");
  });
});
