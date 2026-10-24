import { describe, expect, it } from "vitest";
import {
  computeExerciseMetrics,
  computeSetMetrics,
  percentReduction,
  roundDownToIncrement,
} from "./metrics";

describe("metrics", () => {
  it("counts working sets and tonnage", () => {
    const metrics = computeExerciseMetrics({
      loadMode: "EXTERNAL",
      sets: [
        {
          setType: "WORKING",
          loadMode: "EXTERNAL",
          weightKg: 60,
          assistanceKg: null,
          addedKg: null,
          reps: 8,
          completed: true,
        },
        {
          setType: "WORKING",
          loadMode: "EXTERNAL",
          weightKg: 60,
          assistanceKg: null,
          addedKg: null,
          reps: 8,
          completed: true,
        },
        {
          setType: "WORKING",
          loadMode: "EXTERNAL",
          weightKg: 60,
          assistanceKg: null,
          addedKg: null,
          reps: 5,
          completed: false,
        },
      ],
    });
    expect(metrics.workingSets).toBe(3);
    expect(metrics.completedSets).toBe(2);
    expect(metrics.reps).toBe(21);
    expect(metrics.tonnageKg).toBe(1260);
  });

  it("excludes warm-ups from every metric", () => {
    const metrics = computeExerciseMetrics({
      loadMode: "EXTERNAL",
      sets: [
        {
          setType: "WARMUP",
          loadMode: "EXTERNAL",
          weightKg: 20,
          assistanceKg: null,
          addedKg: null,
          reps: 10,
          completed: true,
        },
        {
          setType: "WORKING",
          loadMode: "EXTERNAL",
          weightKg: 60,
          assistanceKg: null,
          addedKg: null,
          reps: 8,
          completed: true,
        },
      ],
    });
    expect(metrics.workingSets).toBe(1);
    expect(metrics.reps).toBe(8);
    expect(metrics.tonnageKg).toBe(480);
  });

  it("doubles tonnage for a pair of dumbbells", () => {
    const metrics = computeExerciseMetrics({
      loadMode: "EXTERNAL",
      sets: [
        {
          setType: "WORKING",
          loadMode: "EXTERNAL",
          weightKg: 20,
          assistanceKg: null,
          addedKg: null,
          reps: 10,
          completed: true,
          pair: true,
        },
        {
          setType: "WORKING",
          loadMode: "EXTERNAL",
          weightKg: 20,
          assistanceKg: null,
          addedKg: null,
          reps: 10,
          completed: true,
          pair: true,
        },
        {
          setType: "WORKING",
          loadMode: "EXTERNAL",
          weightKg: 20,
          assistanceKg: null,
          addedKg: null,
          reps: 10,
          completed: true,
          pair: true,
        },
      ],
    });
    expect(metrics.reps).toBe(30);
    expect(metrics.tonnageKg).toBe(1200);
  });

  it("multiplies unilateral reps by sides", () => {
    const metrics = computeExerciseMetrics({
      loadMode: "EXTERNAL",
      sets: [
        {
          setType: "WORKING",
          loadMode: "EXTERNAL",
          weightKg: 20,
          assistanceKg: null,
          addedKg: null,
          reps: 10,
          completed: true,
          sides: 2,
        },
        {
          setType: "WORKING",
          loadMode: "EXTERNAL",
          weightKg: 20,
          assistanceKg: null,
          addedKg: null,
          reps: 10,
          completed: true,
          sides: 2,
        },
        {
          setType: "WORKING",
          loadMode: "EXTERNAL",
          weightKg: 20,
          assistanceKg: null,
          addedKg: null,
          reps: 10,
          completed: true,
          sides: 2,
        },
      ],
    });
    expect(metrics.reps).toBe(60);
    expect(metrics.tonnageKg).toBe(1200);
  });

  it("uses null tonnage and effective load for assisted work", () => {
    const metrics = computeSetMetrics(
      {
        setType: "WORKING",
        loadMode: "ASSISTED",
        weightKg: null,
        assistanceKg: 30,
        addedKg: null,
        reps: 6,
        completed: true,
      },
      80,
    );
    expect(metrics.tonnageKg).toBeNull();
    expect(metrics.effectiveLoadKg).toBe(50);
  });

  it("counts only added weight for bodyweight plus", () => {
    const metrics = computeSetMetrics(
      {
        setType: "WORKING",
        loadMode: "BODYWEIGHT_PLUS",
        weightKg: null,
        assistanceKg: null,
        addedKg: 10,
        reps: 5,
        completed: true,
      },
      80,
    );
    expect(metrics.tonnageKg).toBe(50);
    expect(metrics.effectiveLoadKg).toBe(90);
  });

  it("rounds down and applies reductions to available increments", () => {
    expect(roundDownToIncrement(72.4, 2.5)).toBe(70);
    expect(percentReduction(70, 10, 2.5)).toBe(62.5);
  });

  it("is independent of set order", () => {
    const sets = [8, 7, 6].map((reps) => ({
      setType: "WORKING" as const,
      loadMode: "EXTERNAL" as const,
      weightKg: 60,
      assistanceKg: null,
      addedKg: null,
      reps,
      completed: true,
    }));
    const forward = computeExerciseMetrics({ loadMode: "EXTERNAL", sets });
    const reverse = computeExerciseMetrics({
      loadMode: "EXTERNAL",
      sets: [...sets].reverse(),
    });
    expect(forward).toEqual(reverse);
  });
});
