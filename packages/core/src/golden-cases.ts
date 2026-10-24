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
];
