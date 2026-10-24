import type { SafetyLabel } from "@chiron/contracts";

export interface GoldenSetExpectation {
  reps: number;
  weightKg?: number | null;
  assistanceKg?: number | null;
  addedKg?: number | null;
  rir?: number | null;
}

export interface GoldenParserCase {
  id: string;
  text: string;
  exercise: string | null;
  sets: GoldenSetExpectation[];
  safety: SafetyLabel;
  missingFields?: string[];
}

/**
 * Reference cases for the parser contract. The local parser must satisfy them
 * today; the same fixtures are the seed for a future LLM eval harness.
 */
export const GOLDEN_PARSER_CASES: GoldenParserCase[] = [
  {
    id: "bench-weight-reps-rir",
    text: "жим 70 на 8, RIR 2",
    exercise: "жим лёжа",
    sets: [{ reps: 8, weightKg: 70, rir: 2 }],
    safety: "GREEN",
  },
  {
    id: "bench-sets-by-reps",
    text: "3х8 70 кг",
    exercise: null,
    sets: [
      { reps: 8, weightKg: 70 },
      { reps: 8, weightKg: 70 },
      { reps: 8, weightKg: 70 },
    ],
    safety: "GREEN",
  },
  {
    id: "pullups-sequence-assistance",
    text: "подтягивания 6/5/5, помощь 30",
    exercise: "подтягивания",
    sets: [
      { reps: 6, assistanceKg: 30 },
      { reps: 5, assistanceKg: 30 },
      { reps: 5, assistanceKg: 30 },
    ],
    safety: "GREEN",
  },
  {
    id: "rdl-weight-rir",
    text: "румынская тяга 100 на 5, рир 3",
    exercise: "румынская тяга",
    sets: [{ reps: 5, weightKg: 100, rir: 3 }],
    safety: "GREEN",
  },
  {
    id: "sleep-only",
    text: "спал 6, усталость 4",
    exercise: null,
    sets: [],
    safety: "GREEN",
    missingFields: ["exercise", "sets"],
  },
  {
    id: "shoulder-pain",
    text: "болит плечо",
    exercise: null,
    sets: [],
    safety: "YELLOW_PAIN",
  },
  {
    id: "chest-pain-russian",
    text: "болит в груди",
    exercise: null,
    sets: [],
    safety: "RED",
  },
  {
    id: "illness",
    text: "болит горло, температура",
    exercise: null,
    sets: [],
    safety: "YELLOW_ILLNESS",
  },
  {
    id: "chest-pain-english",
    text: "chest pain",
    exercise: null,
    sets: [],
    safety: "RED",
  },
  {
    id: "shoulder-normal",
    text: "жим 70 на 8, плечо норм",
    exercise: "жим лёжа",
    sets: [{ reps: 8, weightKg: 70 }],
    safety: "GREEN",
  },
  {
    id: "word-bolshe-is-not-pain",
    text: "сделал больше повторов",
    exercise: null,
    sets: [],
    safety: "GREEN",
  },
  {
    id: "sets-without-load",
    text: "3х8",
    exercise: null,
    sets: [
      { reps: 8 },
      { reps: 8 },
      { reps: 8 },
    ],
    safety: "GREEN",
    missingFields: ["exercise", "load"],
  },
  {
    id: "single-set",
    text: "жим 70 на 8",
    exercise: "жим лёжа",
    sets: [{ reps: 8, weightKg: 70 }],
    safety: "GREEN",
  },
  {
    id: "pullups-rep-sequence",
    text: "подтягивания 5/5/4",
    exercise: "подтягивания",
    sets: [{ reps: 5 }, { reps: 5 }, { reps: 4 }],
    safety: "GREEN",
  },
  {
    id: "pec-deck",
    text: "бабочка 40 на 12, RIR 1",
    exercise: "бабочка",
    sets: [{ reps: 12, weightKg: 40, rir: 1 }],
    safety: "GREEN",
  },
  {
    id: "biceps",
    text: "бицепс 12 на 12",
    exercise: "бицепс",
    sets: [{ reps: 12, weightKg: 12 }],
    safety: "GREEN",
  },
  {
    id: "decimal-weight",
    text: "жим 72,5 на 8",
    exercise: "жим лёжа",
    sets: [{ reps: 8, weightKg: 72.5 }],
    safety: "GREEN",
  },
  {
    id: "sleep-hours",
    text: "спал 7 часов",
    exercise: null,
    sets: [],
    safety: "GREEN",
    missingFields: ["exercise", "sets"],
  },
  {
    id: "rir-zero",
    text: "жим 70 на 8 rir 0",
    exercise: "жим лёжа",
    sets: [{ reps: 8, weightKg: 70, rir: 0 }],
    safety: "GREEN",
  },
  {
    id: "bodyweight-plus",
    text: "подтягивания 3х5, добавка 10",
    exercise: "подтягивания",
    sets: [
      { reps: 5, addedKg: 10 },
      { reps: 5, addedKg: 10 },
      { reps: 5, addedKg: 10 },
    ],
    safety: "GREEN",
  },
  {
    id: "squat-weight-reps-rir",
    text: "присед 100 на 5, RIR 3",
    exercise: "присед",
    sets: [{ reps: 5, weightKg: 100, rir: 3 }],
    safety: "GREEN",
  },
  {
    id: "rdl-weight-count",
    text: "румынская тяга 80 на 10, 3 подхода",
    exercise: "румынская тяга",
    sets: [
      { reps: 10, weightKg: 80 },
      { reps: 10, weightKg: 80 },
      { reps: 10, weightKg: 80 },
    ],
    safety: "GREEN",
  },
  {
    id: "row-weight-reps",
    text: "тяга 60 на 10",
    exercise: "тяга",
    sets: [{ reps: 10, weightKg: 60 }],
    safety: "GREEN",
  },
  {
    id: "pec-deck-decimal",
    text: "бабочка 42,5 на 12",
    exercise: "бабочка",
    sets: [{ reps: 12, weightKg: 42.5 }],
    safety: "GREEN",
  },
  {
    id: "biceps-rir",
    text: "бицепс 12 на 12, RIR 1",
    exercise: "бицепс",
    sets: [{ reps: 12, weightKg: 12, rir: 1 }],
    safety: "GREEN",
  },
  {
    id: "triceps-weight-reps",
    text: "трицепс 20 на 15",
    exercise: "трицепс",
    sets: [{ reps: 15, weightKg: 20 }],
    safety: "GREEN",
  },
  {
    id: "lateral-raise",
    text: "махи 8 на 15",
    exercise: "средняя дельта",
    sets: [{ reps: 15, weightKg: 8 }],
    safety: "GREEN",
  },
  {
    id: "leg-extension",
    text: "разгибание голени 50 на 12",
    exercise: "разгибание голени",
    sets: [{ reps: 12, weightKg: 50 }],
    safety: "GREEN",
  },
  {
    id: "assisted-pullups-sequence",
    text: "гравитрон 6/5/5, помощь 30",
    exercise: "подтягивания",
    sets: [
      { reps: 6, assistanceKg: 30 },
      { reps: 5, assistanceKg: 30 },
      { reps: 5, assistanceKg: 30 },
    ],
    safety: "GREEN",
  },
  {
    id: "pullups-no-assistance",
    text: "подтягивания 6/5/5 без помощи",
    exercise: "подтягивания",
    sets: [
      { reps: 6, assistanceKg: null },
      { reps: 5, assistanceKg: null },
      { reps: 5, assistanceKg: null },
    ],
    safety: "GREEN",
  },
  {
    id: "kg-suffix-sets",
    text: "3x8 72,5 кг",
    exercise: null,
    sets: [
      { reps: 8, weightKg: 72.5 },
      { reps: 8, weightKg: 72.5 },
      { reps: 8, weightKg: 72.5 },
    ],
    safety: "GREEN",
  },
  {
    id: "sleep-decimal",
    text: "спал 7,5 часов",
    exercise: null,
    sets: [],
    safety: "GREEN",
    missingFields: ["exercise", "sets"],
  },
  {
    id: "rir-words",
    text: "жим 70 на 8, 2 в запасе",
    exercise: "жим лёжа",
    sets: [{ reps: 8, weightKg: 70, rir: 2 }],
    safety: "GREEN",
  },
  {
    id: "sets-without-exercise",
    text: "3х10 50 кг",
    exercise: null,
    sets: [
      { reps: 10, weightKg: 50 },
      { reps: 10, weightKg: 50 },
      { reps: 10, weightKg: 50 },
    ],
    safety: "GREEN",
  },
  {
    id: "rdl-sets-kg",
    text: "румынская тяга 3х8 100 кг",
    exercise: "румынская тяга",
    sets: [
      { reps: 8, weightKg: 100 },
      { reps: 8, weightKg: 100 },
      { reps: 8, weightKg: 100 },
    ],
    safety: "GREEN",
  },
  {
    id: "red-chest-pain",
    text: "жим 70 на 8, боль в груди",
    exercise: "жим лёжа",
    sets: [{ reps: 8, weightKg: 70 }],
    safety: "RED",
  },
  {
    id: "red-fainting",
    text: "потерял сознание после подхода",
    exercise: null,
    sets: [],
    safety: "RED",
  },
  {
    id: "red-shortness",
    text: "не хватает воздуха",
    exercise: null,
    sets: [],
    safety: "RED",
  },
  {
    id: "red-numb-arm",
    text: "онемение в руке",
    exercise: null,
    sets: [],
    safety: "RED",
  },
  {
    id: "red-fever-39",
    text: "температура 39",
    exercise: null,
    sets: [],
    safety: "RED",
  },
  {
    id: "red-trauma-swelling",
    text: "травма колена, отек",
    exercise: null,
    sets: [],
    safety: "RED",
  },
  {
    id: "red-cannot-bear",
    text: "не могу опереться на ногу",
    exercise: null,
    sets: [],
    safety: "RED",
  },
  {
    id: "yellow-illness-cold",
    text: "насморк и кашель",
    exercise: null,
    sets: [],
    safety: "YELLOW_ILLNESS",
  },
  {
    id: "yellow-illness-covid",
    text: "ковид, слабость",
    exercise: null,
    sets: [],
    safety: "YELLOW_ILLNESS",
  },
  {
    id: "yellow-illness-nausea",
    text: "тошнит после тренировки",
    exercise: null,
    sets: [],
    safety: "YELLOW_ILLNESS",
  },
  {
    id: "yellow-pain-knee-click",
    text: "присед 100 на 5, колено щелкнуло",
    exercise: "присед",
    sets: [{ reps: 5, weightKg: 100 }],
    safety: "YELLOW_PAIN",
  },
  {
    id: "yellow-pain-back-spasm",
    text: "прострел в пояснице",
    exercise: null,
    sets: [],
    safety: "YELLOW_PAIN",
  },
  {
    id: "yellow-pain-discomfort",
    text: "дискомфорт в плече",
    exercise: null,
    sets: [],
    safety: "YELLOW_PAIN",
  },
  {
    id: "yellow-pain-crunch",
    text: "хруст в колене",
    exercise: null,
    sets: [],
    safety: "YELLOW_PAIN",
  },
  {
    id: "yellow-illness-fever-37",
    text: "температура 37",
    exercise: null,
    sets: [],
    safety: "YELLOW_ILLNESS",
  },
];
