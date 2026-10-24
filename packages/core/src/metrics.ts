import type { LoadMode, SetType } from "@chiron/contracts";

export interface MetricSetInput {
  setType: SetType;
  loadMode: LoadMode;
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
  reps: number;
  completed: boolean;
  pair?: boolean;
  sides?: number;
}

export interface SetMetrics {
  reps: number;
  countsAsWorking: boolean;
  completed: boolean;
  tonnageKg: number | null;
  effectiveLoadKg: number | null;
  multiplier: number;
}

export interface ExerciseMetrics {
  workingSets: number;
  completedSets: number;
  reps: number;
  tonnageKg: number | null;
  bestEffectiveLoadKg: number | null;
  bestSetReps: number | null;
  hasBodyweightLoad: boolean;
}

const WORKING_TYPES: ReadonlySet<SetType> = new Set([
  "WORKING",
  "BACKOFF",
  "AMRAP",
]);

export function multiplierFor(input: {
  pair?: boolean;
  sides?: number;
}): number {
  if (input.pair) return 2;
  const sides = input.sides ?? 1;
  return sides > 0 ? sides : 1;
}

export function effectiveLoadFor(
  input: Pick<
    MetricSetInput,
    "loadMode" | "weightKg" | "assistanceKg" | "addedKg"
  >,
  bodyweightKg: number | null = null,
): number | null {
  switch (input.loadMode) {
    case "EXTERNAL":
      return input.weightKg;
    case "BODYWEIGHT":
      return bodyweightKg;
    case "ASSISTED":
      if (bodyweightKg === null || input.assistanceKg === null) return null;
      return Math.max(0, bodyweightKg - input.assistanceKg);
    case "BODYWEIGHT_PLUS":
      if (bodyweightKg === null) return null;
      return bodyweightKg + (input.addedKg ?? 0);
  }
}

export function computeSetMetrics(
  input: MetricSetInput,
  bodyweightKg: number | null = null,
): SetMetrics {
  const countsAsWorking =
    WORKING_TYPES.has(input.setType) && input.reps > 0 && input.setType !== "SKIPPED";
  const multiplier = multiplierFor(input);
  const repsMultiplier = (input.sides ?? 1) > 1 ? (input.sides ?? 1) : 1;
  const effectiveLoadKg = effectiveLoadFor(input, bodyweightKg);

  if (!countsAsWorking) {
    return {
      reps: 0,
      countsAsWorking: false,
      completed: input.completed,
      tonnageKg: null,
      effectiveLoadKg,
      multiplier,
    };
  }

  let tonnageKg: number | null = null;
  if (input.loadMode === "EXTERNAL") {
    tonnageKg = (input.weightKg ?? 0) * input.reps * multiplier;
  } else if (input.loadMode === "BODYWEIGHT_PLUS") {
    tonnageKg = (input.addedKg ?? 0) * input.reps * multiplier;
  }

  return {
    reps: input.reps * repsMultiplier,
    countsAsWorking: true,
    completed: input.completed,
    tonnageKg,
    effectiveLoadKg,
    multiplier,
  };
}

export function computeExerciseMetrics(
  input: {
    loadMode: LoadMode;
    sets: MetricSetInput[];
  },
  bodyweightKg: number | null = null,
): ExerciseMetrics {
  let workingSets = 0;
  let completedSets = 0;
  let reps = 0;
  let tonnage = 0;
  let tonnageValid = true;
  let bestEffectiveLoadKg: number | null = null;
  let bestSetReps: number | null = null;

  for (const set of input.sets) {
    const metrics = computeSetMetrics(
      { ...set, loadMode: input.loadMode },
      bodyweightKg,
    );
    if (!metrics.countsAsWorking) continue;
    workingSets += 1;
    if (metrics.completed) completedSets += 1;
    reps += metrics.reps;
    if (metrics.tonnageKg === null) tonnageValid = false;
    else tonnage += metrics.tonnageKg;

    if (
      metrics.effectiveLoadKg !== null &&
      (bestEffectiveLoadKg === null ||
        metrics.effectiveLoadKg > bestEffectiveLoadKg ||
        (metrics.effectiveLoadKg === bestEffectiveLoadKg &&
          metrics.reps > (bestSetReps ?? -1)))
    ) {
      bestEffectiveLoadKg = metrics.effectiveLoadKg;
      bestSetReps = metrics.reps;
    }
  }

  return {
    workingSets,
    completedSets,
    reps,
    tonnageKg: tonnageValid && workingSets > 0 ? tonnage : null,
    bestEffectiveLoadKg,
    bestSetReps,
    hasBodyweightLoad:
      input.loadMode === "BODYWEIGHT" || input.loadMode === "ASSISTED",
  };
}

export function roundDownToIncrement(
  value: number,
  increment: number,
): number {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) {
    return value;
  }
  const steps = Math.floor((value + 1e-9) / increment);
  return normalizeNumber(steps * increment);
}

export function roundToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) {
    return value;
  }
  const steps = Math.round((value + 1e-9) / increment);
  return normalizeNumber(steps * increment);
}

export function roundUpToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) {
    return value;
  }
  const steps = Math.ceil((value - 1e-9) / increment);
  return normalizeNumber(steps * increment);
}

export function normalizeNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function percentReduction(
  value: number,
  percent: number,
  increment: number,
): number {
  return roundDownToIncrement(value * (1 - percent / 100), increment);
}

export function incrementLoad(
  value: number,
  increment: number,
): number {
  return normalizeNumber(value + increment);
}
