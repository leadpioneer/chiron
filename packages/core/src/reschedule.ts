import type { SessionStatus } from "@chiron/contracts";
import { addDays, cycleEndDate, parseIsoDate } from "./schedule";

export const MAX_CYCLE_EXTENSION_DAYS = 14;

export type RescheduleMode = "SINGLE" | "SHIFT_TAIL";

export type RescheduleErrorCode =
  | "NOT_PLANNED"
  | "DATE_IN_PAST"
  | "DATE_BEYOND_CYCLE"
  | "ORDER_CONFLICT"
  | "EXTENSION_LIMIT"
  | "END_BEFORE_START";

export interface RescheduleInput {
  status: SessionStatus;
  mode: RescheduleMode;
  currentDate: string;
  newDate: string;
  today: string;
  cycleStartDate: string;
  cycleEndDate: string;
  nextPlannedDate: string | null;
}

export interface RescheduleSuccess {
  ok: true;
  mode: RescheduleMode;
  deltaDays: number;
  endDateBefore: string;
  endDateAfter: string;
  extensionDays: number;
}

export interface RescheduleFailure {
  ok: false;
  code: RescheduleErrorCode;
  message: string;
}

export type ReschedulePlan = RescheduleSuccess | RescheduleFailure;

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseIsoDate(value);
  return date.toISOString().slice(0, 10) === value;
}

export function differenceInDays(from: string, to: string): number {
  const first = parseIsoDate(from).getTime();
  const second = parseIsoDate(to).getTime();
  return Math.round((second - first) / 86_400_000);
}

function failure(
  code: RescheduleErrorCode,
  message: string,
): RescheduleFailure {
  return { ok: false, code, message };
}

export function planReschedule(input: RescheduleInput): ReschedulePlan {
  if (input.status !== "PLANNED") {
    return failure(
      "NOT_PLANNED",
      "Перенести можно только запланированную тренировку",
    );
  }
  if (!isIsoDate(input.newDate)) {
    return failure("DATE_IN_PAST", "Укажите корректную дату");
  }
  if (input.newDate < input.today) {
    return failure("DATE_IN_PAST", "Новая дата не может быть в прошлом");
  }

  const maxDate = addDays(input.cycleEndDate, MAX_CYCLE_EXTENSION_DAYS);
  if (input.newDate > maxDate) {
    return failure(
      "DATE_BEYOND_CYCLE",
      `Дата не может быть позже ${maxDate}. Для более позднего старта пересмотрите цикл.`,
    );
  }

  const deltaDays = differenceInDays(input.currentDate, input.newDate);
  const endDateBefore = input.cycleEndDate;
  const endDateAfter =
    input.mode === "SHIFT_TAIL"
      ? addDays(input.cycleEndDate, deltaDays)
      : input.cycleEndDate;

  if (input.mode === "SINGLE") {
    if (
      input.nextPlannedDate !== null &&
      input.newDate >= input.nextPlannedDate
    ) {
      return failure(
        "ORDER_CONFLICT",
        "Дата пересекается со следующей тренировкой. Сдвинуть оставшиеся?",
      );
    }
  }

  if (endDateAfter < input.cycleStartDate) {
    return failure(
      "END_BEFORE_START",
      "Сдвиг завершает цикл раньше его начала",
    );
  }

  const baseEnd = cycleEndDate(input.cycleStartDate, 8);
  const extensionDays = differenceInDays(baseEnd, endDateAfter);
  if (input.mode === "SHIFT_TAIL" && extensionDays > MAX_CYCLE_EXTENSION_DAYS) {
    return failure(
      "EXTENSION_LIMIT",
      `Цикл нельзя продлить больше чем на ${MAX_CYCLE_EXTENSION_DAYS} дней. Пересмотрите цикл.`,
    );
  }

  return {
    ok: true,
    mode: input.mode,
    deltaDays,
    endDateBefore,
    endDateAfter,
    extensionDays,
  };
}
