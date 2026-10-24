import type { SafetyAssessment, WellnessSnapshot } from "./types";

const RED_PATTERNS: RegExp[] = [
  /боль\s+в\s+груд(и|ной\s+клетке)/i,
  /бол(ит|ь|и)\s+в\s+груд(и|ной\s+клетке)/i,
  /давит\s+в\s+груд(и|ной\s+клетке)/i,
  /chest\s+pain/i,
  /обморок/i,
  /потерял[а]?\s+сознание/i,
  /не\s+хватает\s+воздуха/i,
  /выраженн(ая|ой)\s+одышк/i,
  /одышк(а|и)\s+в\s+покое/i,
  /онемени(е|я)\s+(в\s+)?(руке|ноге|лице)/i,
  /слабость\s+в\s+(руке|ноге)/i,
  /невролог/i,
  /лихорад/i,
  /температура\s+(38|39|40)/i,
  /травм[аы].*(отек|отёк|блок)/i,
  /не\s+могу\s+опереться\s+на\s+ногу/i,
];

const PAIN_PATTERNS: RegExp[] = [
  /(^|[^а-яё])бол(ит|ь|и)([^а-яё]|$)/i,
  /(^|[^а-яё])боль([^а-яё]|$)/i,
  /дискомфорт/i,
  /щелк/i,
  /хруст/i,
  /прострел/i,
];

const ILLNESS_PATTERNS: RegExp[] = [
  /простуд/i,
  /болит\s+горло/i,
  /насморк/i,
  /кашел/i,
  /температур/i,
  /тошнит/i,
  /озноб/i,
  /грипп/i,
  /ковид|covid/i,
];

function matches(patterns: RegExp[], text: string): string | null {
  for (const pattern of patterns) {
    if (pattern.test(text)) return pattern.source;
  }
  return null;
}

export function assessSafety(input: {
  text?: string | null;
  wellness?: WellnessSnapshot | null;
}): SafetyAssessment {
  const text = (input.text ?? "").toLowerCase();
  const wellness = input.wellness ?? null;
  const reasons: string[] = [];

  const red = matches(RED_PATTERNS, text);
  if (red) {
    reasons.push("В тексте есть сигнал, требующий прекращения тренировки.");
    return {
      label: "RED",
      reasons,
      blockProgression: true,
      pause: true,
      escalate: true,
    };
  }

  const illnessText = matches(ILLNESS_PATTERNS, text);
  const illness =
    wellness?.illness === "CONFIRMED" || wellness?.illness === "SIGNS";
  if (illness || illnessText) {
    reasons.push("Есть признаки болезни. Повышение нагрузки не предлагается.");
    return {
      label: "YELLOW_ILLNESS",
      reasons,
      blockProgression: true,
      pause: false,
      escalate: false,
    };
  }

  const painText = matches(PAIN_PATTERNS, text);
  const pain =
    Boolean(painText) ||
    wellness?.symptom === true ||
    wellness?.soreness === "LOCAL" ||
    wellness?.soreness === "SEVERE";
  if (pain) {
    reasons.push("Есть боль или дискомфорт. Нужно уточнение и удержание нагрузки.");
    return {
      label: "YELLOW_PAIN",
      reasons,
      blockProgression: true,
      pause: false,
      escalate: false,
    };
  }

  if (
    (wellness?.sleepHours !== null &&
      wellness?.sleepHours !== undefined &&
      wellness.sleepHours < 5) ||
    (wellness?.fatigue !== null &&
      wellness?.fatigue !== undefined &&
      wellness.fatigue >= 5) ||
    (wellness?.stress !== null &&
      wellness?.stress !== undefined &&
      wellness.stress >= 5) ||
    wellness?.soreness === "SEVERE"
  ) {
    reasons.push("Сон или восстановление ниже порога. Повышение приостановлено.");
    return {
      label: "YELLOW_SYSTEMIC",
      reasons,
      blockProgression: true,
      pause: false,
      escalate: false,
    };
  }

  return {
    label: "GREEN",
    reasons: [],
    blockProgression: false,
    pause: false,
    escalate: false,
  };
}

const SEVERITY: Record<SafetyAssessment["label"], number> = {
  GREEN: 0,
  YELLOW_PAIN: 1,
  YELLOW_SYSTEMIC: 1,
  YELLOW_ILLNESS: 2,
  RED: 3,
};

export function mergeSafetyAssessments(
  ...assessments: SafetyAssessment[]
): SafetyAssessment {
  let selected: SafetyAssessment = {
    label: "GREEN",
    reasons: [],
    blockProgression: false,
    pause: false,
    escalate: false,
  };

  for (const assessment of assessments) {
    if (SEVERITY[assessment.label] < SEVERITY[selected.label]) continue;
    selected = {
      label:
        SEVERITY[assessment.label] > SEVERITY[selected.label]
          ? assessment.label
          : selected.label,
      reasons: [...selected.reasons, ...assessment.reasons],
      blockProgression:
        selected.blockProgression || assessment.blockProgression,
      pause: selected.pause || assessment.pause,
      escalate: selected.escalate || assessment.escalate,
    };
  }

  return selected;
}

export const RED_FLAG_TEXT =
  "Остановите тренировку. При боли в груди, обмороке, выраженной одышке, неврологических симптомах или острой травме обратитесь за неотложной медицинской помощью. Приложение не оценивает причину симптома.";
