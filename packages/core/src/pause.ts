import type { LoadMode } from "@chiron/contracts";
import { normalizeNumber, percentReduction } from "./metrics";
import { differenceInDays } from "./reschedule";

export type PausePhase = "NONE" | "RETURN_1" | "RETURN_2" | "LONG" | "SAFETY";

export interface PauseState {
  phase: PausePhase;
  days: number;
  sinceDate: string;
  lastExposureDate: string | null;
  safetyDays: number | null;
  returnPercent: number | null;
  returnSessions: number;
  targetRirs: number[];
  reason: string;
}

export interface ReturnLoadInput {
  loadMode: LoadMode;
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
  incrementKg: number;
  percent: number;
}

export interface ReturnLoad {
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
}

export function classifyPauseGap(days: number): Exclude<PausePhase, "SAFETY"> {
  if (days >= 28) return "LONG";
  if (days >= 14) return "RETURN_2";
  if (days >= 8) return "RETURN_1";
  return "NONE";
}

export function buildPauseState(input: {
  lastExposureDate: string | null;
  cycleStartDate: string;
  today: string;
  safetyPausedAt?: string | null;
}): PauseState {
  const sinceDate = input.lastExposureDate ?? input.cycleStartDate;
  const gapDays = Math.max(0, differenceInDays(sinceDate, input.today));

  if (input.safetyPausedAt) {
    const safetyDays = Math.max(
      0,
      differenceInDays(input.safetyPausedAt, input.today),
    );
    if (safetyDays >= 14) {
      return {
        phase: "LONG",
        days: Math.max(gapDays, safetyDays),
        sinceDate,
        lastExposureDate: input.lastExposureDate,
        safetyDays,
        returnPercent: null,
        returnSessions: 0,
        targetRirs: [],
        reason: "SAFETY",
      };
    }
    return {
      phase: "SAFETY",
      days: Math.max(gapDays, safetyDays),
      sinceDate,
      lastExposureDate: input.lastExposureDate,
      safetyDays,
      returnPercent: null,
      returnSessions: 0,
      targetRirs: [],
      reason: "SAFETY",
    };
  }

  const phase = classifyPauseGap(gapDays);
  if (phase === "RETURN_1") {
    return {
      phase,
      days: gapDays,
      sinceDate,
      lastExposureDate: input.lastExposureDate,
      safetyDays: null,
      returnPercent: 5,
      returnSessions: 1,
      targetRirs: [3],
      reason: "PAUSE_8_13",
    };
  }
  if (phase === "RETURN_2") {
    return {
      phase,
      days: gapDays,
      sinceDate,
      lastExposureDate: input.lastExposureDate,
      safetyDays: null,
      returnPercent: 10,
      returnSessions: 2,
      targetRirs: [4, 3],
      reason: "PAUSE_14_27",
    };
  }
  return {
    phase,
    days: gapDays,
    sinceDate,
    lastExposureDate: input.lastExposureDate,
    safetyDays: null,
    returnPercent: null,
    returnSessions: 0,
    targetRirs: [],
    reason: phase === "LONG" ? "PAUSE_28_PLUS" : "NONE",
  };
}

export function applyReturnLoad(input: ReturnLoadInput): ReturnLoad {
  if (input.percent <= 0) {
    return {
      weightKg: input.weightKg,
      assistanceKg: input.assistanceKg,
      addedKg: input.addedKg,
    };
  }
  switch (input.loadMode) {
    case "EXTERNAL":
      return {
        weightKg:
          input.weightKg === null
            ? null
            : percentReduction(
                input.weightKg,
                input.percent,
                input.incrementKg,
              ),
        assistanceKg: null,
        addedKg: null,
      };
    case "ASSISTED": {
      if (input.assistanceKg === null) {
        return { weightKg: null, assistanceKg: null, addedKg: null };
      }
      const steps = Math.max(1, Math.round(input.percent / 5));
      return {
        weightKg: null,
        assistanceKg: normalizeNumber(
          input.assistanceKg + input.incrementKg * steps,
        ),
        addedKg: null,
      };
    }
    case "BODYWEIGHT_PLUS":
      return {
        weightKg: null,
        assistanceKg: null,
        addedKg:
          input.addedKg === null
            ? null
            : Math.max(
                0,
                percentReduction(input.addedKg, input.percent, input.incrementKg),
              ),
      };
    case "BODYWEIGHT":
      return { weightKg: null, assistanceKg: null, addedKg: null };
  }
}
