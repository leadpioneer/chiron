import type { LlmResponse } from "@chiron/contracts";
import { assessSafety } from "./safety";

const EXERCISE_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  {
    canonical: "жим лёжа",
    aliases: ["жим лёжа", "жим лежа", "жим", "bench press", "bench", "бенч"],
  },
  {
    canonical: "подтягивания",
    aliases: ["подтягивания", "подтягивание", "гравитрон", "pull up"],
  },
  {
    canonical: "румынская тяга",
    aliases: ["румынская тяга", "румынка", "rdl", "румынскую"],
  },
  {
    canonical: "ягодичный мостик",
    aliases: [
      "ягодичный мостик",
      "ягодичный мост",
      "ягодичный мост со штангой",
      "glute bridge",
    ],
  },
  {
    canonical: "присед",
    aliases: ["присед", "приседания", "фронтальный присед", "гакк", "squat"],
  },
  {
    canonical: "тяга",
    aliases: ["тяга", "горизонтальная тяга", "row"],
  },
  {
    canonical: "бабочка",
    aliases: ["бабочка", "pec deck", "пек-дек"],
  },
  {
    canonical: "разгибание голени",
    aliases: ["разгибание голени", "разгибания", "leg extension"],
  },
  {
    canonical: "бицепс",
    aliases: ["бицепс", "подъём на бицепс", "curl"],
  },
  {
    canonical: "трицепс",
    aliases: ["трицепс", "разгибание на трицепс", "pushdown"],
  },
  {
    canonical: "средняя дельта",
    aliases: ["средняя дельта", "махи", "lateral raise"],
  },
];

function detectExercise(text: string): string | null {
  const lower = text.toLowerCase();
  for (const item of EXERCISE_ALIASES) {
    if (item.aliases.some((alias) => lower.includes(alias))) {
      return item.canonical;
    }
  }
  return null;
}

export function normalizeExerciseAlias(alias: string | null): string | null {
  if (!alias) return null;
  const normalized = alias.trim();
  const lower = normalized.toLowerCase();
  for (const item of EXERCISE_ALIASES) {
    if (
      lower === item.canonical ||
      item.aliases.some(
        (candidate) =>
          lower === candidate || lower.includes(candidate),
      )
    ) {
      return item.canonical;
    }
  }
  return normalized || null;
}

function parseNumber(value: string): number {
  return Number(value.replace(",", "."));
}

export function parseWorkoutText(text: string): LlmResponse {
  const normalized = text.trim();
  const lower = normalized.toLowerCase();
  const exerciseAlias = detectExercise(normalized);
  const safety = assessSafety({ text: normalized });

  const rirMatch =
    lower.match(/(?:rir|рир)\s*[:=]?\s*(\d)/i) ??
    lower.match(/(\d)\s*(?:повтор\w*\s*)?в\s*запасе/i);
  const rir = rirMatch ? Math.min(4, Math.max(0, Number(rirMatch[1]))) : null;

  const sleepMatch =
    lower.match(/(?:спал|сон|поспал)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i) ??
    lower.match(/(\d+(?:[.,]\d+)?)\s*(?:ч|час\w*)\s*(?:сна|спал)/i);
  const sleepHours = sleepMatch ? parseNumber(sleepMatch[1]!) : null;

  const assistanceMatch = lower.match(
    /(?:помощь|ассист|assistance)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i,
  );
  const assistanceKg = assistanceMatch
    ? parseNumber(assistanceMatch[1]!)
    : null;

  const addedMatch = lower.match(
    /(?:добавка|доп\.?\s*вес|added)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i,
  );
  const addedKg = addedMatch ? parseNumber(addedMatch[1]!) : null;

  const setsMatch = lower.match(/(\d+)\s*[хx×]\s*(\d+)(?:\s*[хx×]\s*(\d+))?/);
  const weightRepsMatch = lower.match(
    /(\d+(?:[.,]\d+)?)\s*(?:кг)?\s*(?:на|по|for)\s*(\d+)/i,
  );
  const repsSequenceMatch = lower.match(
    /(?:^|\s)(\d+(?:\s*[/,]\s*\d+){2,})(?=[\s,.;]|$)/,
  );

  const sets: LlmResponse["parsedFacts"]["sets"] = [];
  let weightKg: number | null = null;
  let repsPerSet: number[] = [];

  if (setsMatch) {
    const setCount = Math.max(1, Math.min(20, Number(setsMatch[1])));
    const reps = Math.max(0, Math.min(200, Number(setsMatch[2])));
    repsPerSet = Array.from({ length: setCount }, () => reps);
    if (setsMatch[3]) {
      weightKg = parseNumber(setsMatch[3]!);
    } else {
      const tail = lower.slice((setsMatch.index ?? 0) + setsMatch[0].length);
      const weightAfter = tail.match(/(\d+(?:[.,]\d+)?)\s*кг/);
      if (weightAfter) weightKg = parseNumber(weightAfter[1]!);
    }
  } else if (weightRepsMatch) {
    weightKg = parseNumber(weightRepsMatch[1]!);
    repsPerSet = [Math.max(0, Math.min(200, Number(weightRepsMatch[2])))];
    const countMatch = lower.match(/(\d+)\s*(?:подход\w*|сет\w*)/);
    if (countMatch) {
      const count = Math.max(1, Math.min(20, Number(countMatch[1])));
      repsPerSet = Array.from({ length: count }, () => repsPerSet[0]!);
    }
  } else if (repsSequenceMatch) {
    repsPerSet = repsSequenceMatch[1]!
      .split(/[/,]/)
      .map((part) => Math.max(0, Math.min(200, Number(part.trim()))))
      .filter((value) => Number.isFinite(value));
  }

  if (weightKg === null && weightRepsMatch) {
    weightKg = parseNumber(weightRepsMatch[1]!);
  }

  for (const reps of repsPerSet) {
    sets.push({
      weightKg: assistanceKg !== null || addedKg !== null ? null : weightKg,
      assistanceKg,
      addedKg,
      reps,
      rir,
      setType: "WORKING",
      sourceSpan: normalized.slice(0, 240),
    });
  }

  const missingFields: string[] = [];
  if (!exerciseAlias) missingFields.push("exercise");
  if (sets.length === 0) missingFields.push("sets");
  if (sets.length > 0 && weightKg === null && assistanceKg === null && addedKg === null) {
    missingFields.push("load");
  }
  if (rir === null) missingFields.push("rir");

  const ambiguities: LlmResponse["ambiguities"] = [];
  if (!exerciseAlias && sets.length > 0) {
    ambiguities.push({
      field: "exercise",
      question: "Какое упражнение вы выполнили?",
    });
  }
  if (sets.length === 0) {
    ambiguities.push({
      field: "sets",
      question: "Сколько подходов и повторов было выполнено?",
    });
  }
  if (/\b(lb|lbs|фунт)/i.test(lower)) {
    ambiguities.push({
      field: "weight_unit",
      question: "Вес указан в фунтах? Переведите его в килограммы.",
    });
  }
  if (weightKg !== null && weightKg > 500) {
    ambiguities.push({
      field: "weight_kg",
      question: "Проверьте единицы: значение веса выглядит необычно большим.",
    });
  }

  const safetyObservations: LlmResponse["safetyObservations"] =
    safety.label === "GREEN"
      ? []
      : [{ code: safety.label, quote: normalized.slice(0, 240) }];

  return {
    schemaVersion: "1.0",
    parsedFacts: {
      exerciseAlias,
      exerciseVariantId: null,
      targetBlockId: null,
      role: null,
      sets,
      sleepHours,
      symptoms: safety.label === "GREEN" ? [] : [safety.label],
    },
    missingFields,
    ambiguities,
    safetyObservations,
    selectedActionId: null,
    explanation:
      "Разобрано локальным парсером. Проверьте упражнение, вес, повторы и RIR перед сохранением.",
    confidence: 0.55,
  };
}
