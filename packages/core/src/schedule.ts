import type { TrainingScheme } from "@chiron/contracts";

export interface ScheduledSession {
  sessionIndex: number;
  sessionKey: "A" | "B";
  plannedDate: string;
}

export function parseIsoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function cycleEndDate(startDate: string, weeks = 8): string {
  return addDays(startDate, weeks * 7 - 1);
}

function buildSchedule(
  startDate: string,
  weeks: number,
  shouldTrain: (offset: number) => boolean,
): ScheduledSession[] {
  const start = parseIsoDate(startDate);
  const sessions: ScheduledSession[] = [];
  const totalDays = weeks * 7;

  for (let offset = 0; offset < totalDays; offset += 1) {
    if (!shouldTrain(offset)) continue;
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const sessionIndex = sessions.length;
    sessions.push({
      sessionIndex,
      sessionKey: sessionIndex % 2 === 0 ? "A" : "B",
      plannedDate: toIsoDate(date),
    });
  }

  return sessions;
}

export function generateSessionSchedule(
  startDate: string,
  scheme: TrainingScheme,
  weeks = 8,
): ScheduledSession[] {
  if (scheme === "EVERY_OTHER_DAY") {
    return buildSchedule(startDate, weeks, (offset) => offset % 2 === 0);
  }
  if (scheme === "FIVE_DAY_CYCLE") {
    return buildSchedule(
      startDate,
      weeks,
      (offset) => offset % 5 === 0 || offset % 5 === 2,
    );
  }
  return [];
}

/**
 * Used by future 3+ day splits, where the user chooses weekdays.
 * The V1 two-day template uses generateSessionSchedule instead.
 */
export function generateWeekdaySchedule(
  startDate: string,
  weekdays: readonly [number, number],
  weeks = 8,
): ScheduledSession[] {
  const start = parseIsoDate(startDate);
  return buildSchedule(startDate, weeks, (offset) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    return weekdays.includes(date.getUTCDay());
  });
}
