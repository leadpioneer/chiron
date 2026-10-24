const WEEKDAYS = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];

const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "short",
  }).format(date);
}

export function formatDateShort(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

export function weekdayName(value: number): string {
  return WEEKDAYS[value] ?? "";
}

export function weekdayShort(value: number): string {
  return WEEKDAYS_SHORT[value] ?? "";
}

export function formatWeight(
  value: number | null,
  options: { unit?: string; prefix?: string } = {},
): string {
  if (value === null) return "—";
  const formatted = Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(".", ",");
  return `${options.prefix ?? ""}${formatted}${options.unit ? ` ${options.unit}` : ""}`;
}

export function formatRange(min: number, max: number): string {
  return `${min}–${max}`;
}
