import { applyReturnLoad, type ReturnLoadInput } from "./pause";

export const RETURN_PHASE_SESSIONS = 4;

/**
 * Multiplier for rebuilding a cycle after a pause.
 * 0-13 days: 100%, 14-42: 90%, 43-84: 80%, 85-168: 70%, >168: calibration.
 * The 14-27 day safety band is handled conservatively by the 90% step.
 */
export function rebuildMultiplierForDays(days: number): number | null {
  if (days <= 13) return 1;
  if (days <= 42) return 0.9;
  if (days <= 84) return 0.8;
  if (days <= 168) return 0.7;
  return null;
}

export function applyCycleMultiplier(
  input: Omit<ReturnLoadInput, "percent">,
  multiplier: number | null,
) {
  if (multiplier === null) {
    return { weightKg: null, assistanceKg: null, addedKg: null };
  }
  return applyReturnLoad({
    ...input,
    percent: Math.round((1 - multiplier) * 100),
  });
}
