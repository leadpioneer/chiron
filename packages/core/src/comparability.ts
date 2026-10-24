import type { LoadMode, Technique } from "@chiron/contracts";

export interface ComparableExposureMeta {
  exerciseVariantId: string;
  equipmentSettingsHash: string;
  loadMode: LoadMode;
  date: string;
  technique: Technique;
  duringDeload: boolean;
  duringReturn: boolean;
}

export const COMPARABLE_WINDOW_DAYS = 42;

export function daysBetween(a: string, b: string): number | null {
  const first = Date.parse(a);
  const second = Date.parse(b);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.abs(first - second) / 86_400_000;
}

export function areComparable(
  a: ComparableExposureMeta,
  b: ComparableExposureMeta,
  windowDays: number = COMPARABLE_WINDOW_DAYS,
): boolean {
  if (a.exerciseVariantId !== b.exerciseVariantId) return false;
  if (a.equipmentSettingsHash !== b.equipmentSettingsHash) return false;
  if (a.loadMode !== b.loadMode) return false;
  if (a.technique === "LIMIT" || b.technique === "LIMIT") return false;
  if (a.duringDeload || b.duringDeload) return false;
  if (a.duringReturn || b.duringReturn) return false;
  const days = daysBetween(a.date, b.date);
  if (days === null) return false;
  return days <= windowDays;
}
