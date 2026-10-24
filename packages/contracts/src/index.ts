import { z } from "zod";

export const roleSchema = z.enum(["PRIMARY", "ACCESSORY", "AESTHETIC"]);
export type Role = z.infer<typeof roleSchema>;

export const loadModeSchema = z.enum([
  "EXTERNAL",
  "BODYWEIGHT",
  "ASSISTED",
  "BODYWEIGHT_PLUS",
]);
export type LoadMode = z.infer<typeof loadModeSchema>;

export const setTypeSchema = z.enum([
  "WARMUP",
  "WORKING",
  "BACKOFF",
  "AMRAP",
  "SKIPPED",
]);
export type SetType = z.infer<typeof setTypeSchema>;

export const actionSchema = z.enum([
  "PROGRESS",
  "HOLD",
  "LOCAL_REDUCE",
  "SUBSTITUTE",
  "DELOAD",
  "REBUILD",
  "PAUSE",
  "ESCALATE",
]);
export type Action = z.infer<typeof actionSchema>;

export const scopeTypeSchema = z.enum([
  "EXERCISE",
  "TARGET_BLOCK",
  "SESSION",
  "CYCLE",
]);
export type ScopeType = z.infer<typeof scopeTypeSchema>;

export const safetyLabelSchema = z.enum([
  "GREEN",
  "YELLOW_PAIN",
  "YELLOW_SYSTEMIC",
  "YELLOW_ILLNESS",
  "RED",
]);
export type SafetyLabel = z.infer<typeof safetyLabelSchema>;

export const techniqueSchema = z.enum(["NORMAL", "CHANGED", "LIMIT"]);
export type Technique = z.infer<typeof techniqueSchema>;

export const sessionRpeSchema = z.enum(["EASY", "MODERATE", "HARD", "MAX"]);
export type SessionRpe = z.infer<typeof sessionRpeSchema>;

export const cycleStatusSchema = z.enum([
  "ACTIVE",
  "COMPLETED",
  "INCOMPLETE",
  "STOPPED",
]);
export type CycleStatus = z.infer<typeof cycleStatusSchema>;

export const sessionStatusSchema = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
  "CANCELLED",
]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const recommendationStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "EDITED",
  "REJECTED",
  "EXPIRED",
]);
export type RecommendationStatus = z.infer<typeof recommendationStatusSchema>;

export const decisionOutcomeSchema = z.enum(["ACCEPTED", "EDITED", "REJECTED"]);
export type DecisionOutcome = z.infer<typeof decisionOutcomeSchema>;

export const experienceSchema = z.enum([
  "BEGINNER",
  "RETURNING",
  "INTERMEDIATE",
]);
export type Experience = z.infer<typeof experienceSchema>;

export const goalSchema = z.enum(["STRENGTH", "AESTHETIC", "BOTH"]);
export type Goal = z.infer<typeof goalSchema>;

export const trainingSchemeSchema = z.enum([
  "EVERY_OTHER_DAY",
  "FIVE_DAY_CYCLE",
]);
export type TrainingScheme = z.infer<typeof trainingSchemeSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const telegramAuthSchema = z.object({
  initData: z.string().min(1).max(8192),
});
export type TelegramAuth = z.infer<typeof telegramAuthSchema>;

export const telegramWidgetAuthSchema = z.object({
  params: z.record(z.string(), z.string().max(1024)),
});
export type TelegramWidgetAuth = z.infer<typeof telegramWidgetAuthSchema>;

export const startingLoadsSchema = z.object({
  verticalPull: z.number().min(0).max(500).nullable(),
  hinge: z.number().min(0).max(500).nullable(),
  squat: z.number().min(0).max(500).nullable(),
  press: z.number().min(0).max(500).nullable(),
});
export type StartingLoads = z.infer<typeof startingLoadsSchema>;

export const onboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  experience: experienceSchema,
  goal: goalSchema,
  bodyweightKg: z.number().min(30).max(300).nullable(),
  heightCm: z.number().min(100).max(250).nullable(),
  bodyFatPercent: z.number().min(3).max(60).nullable(),
  breakWeeks: z.number().int().min(0).max(520).nullable(),
  trainingScheme: trainingSchemeSchema,
  variants: z.object({
    verticalPull: z.enum(["assisted_pull_up", "lat_pulldown"]),
    hinge: z.enum(["barbell_rdl", "dumbbell_rdl"]),
    squat: z.enum(["front_squat", "hack_squat"]),
    press: z.enum(["barbell_bench", "dumbbell_bench"]),
  }),
  accessories: z.object({
    row: z.boolean(),
    pullover: z.boolean(),
    legExtension: z.boolean(),
    pecDeck: z.boolean(),
  }),
  aesthetic: z
    .array(z.enum(["biceps_curl", "triceps_pushdown", "lateral_raise"]))
    .max(2),
  startingLoads: startingLoadsSchema,
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const setPerformanceSchema = z.object({
  clientSetId: z.string().uuid(),
  prescriptionId: z.string().uuid(),
  setType: setTypeSchema,
  weightKg: z.number().min(0).max(1000).nullable(),
  assistanceKg: z.number().min(0).max(500).nullable(),
  addedKg: z.number().min(0).max(500).nullable(),
  reps: z.number().int().min(0).max(200),
  rir: z.number().int().min(0).max(4).nullable(),
  technique: techniqueSchema,
  pain: z.boolean().default(false),
  completed: z.boolean(),
  actualOrder: z.number().int().min(0).max(100),
});
export type SetPerformanceInput = z.infer<typeof setPerformanceSchema>;

export const completeSessionSchema = z.object({
  sessionRpe: sessionRpeSchema,
  comment: z.string().max(1000).nullable().optional(),
});
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;

export const wellnessSchema = z.object({
  sleepHours: z.number().min(0).max(24).nullable(),
  sleepQuality: z.number().int().min(1).max(5).nullable(),
  fatigue: z.number().int().min(1).max(5).nullable(),
  stress: z.number().int().min(1).max(5).nullable(),
  motivation: z.number().int().min(1).max(5).nullable(),
  soreness: z.enum(["NONE", "LOCAL", "SEVERE"]).nullable(),
  symptom: z.boolean().nullable(),
  symptomText: z.string().max(1000).nullable(),
  illness: z.enum(["NONE", "SIGNS", "CONFIRMED"]).nullable(),
});
export type WellnessInput = z.infer<typeof wellnessSchema>;

export const decisionSchema = z.object({
  outcome: decisionOutcomeSchema,
  reasonCategory: z
    .enum([
      "AGREE",
      "TOO_HARD",
      "TOO_EASY",
      "NO_TIME",
      "EQUIPMENT",
      "PAIN",
      "DISAGREE",
      "OTHER",
    ])
    .nullable(),
  comment: z.string().max(1000).nullable(),
  edits: z
    .array(
      z.object({
        prescriptionId: z.string().uuid(),
        weightKg: z.number().min(0).max(1000).nullable(),
        assistanceKg: z.number().min(0).max(500).nullable(),
        addedKg: z.number().min(0).max(500).nullable(),
        targetReps: z.number().int().min(1).max(50).nullable(),
        sets: z.number().int().min(1).max(10).nullable(),
      }),
    )
    .max(20)
    .default([]),
});
export type DecisionInput = z.infer<typeof decisionSchema>;

export const skipSessionSchema = z.object({
  reason: z.enum(["NO_TIME", "ILLNESS", "EQUIPMENT", "OTHER"]),
  comment: z.string().max(500).nullable().optional(),
});
export type SkipSessionInput = z.infer<typeof skipSessionSchema>;

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Некорректная дата");

export const rescheduleModeSchema = z.enum(["SINGLE", "SHIFT_TAIL"]);
export type RescheduleMode = z.infer<typeof rescheduleModeSchema>;

export const rescheduleSessionSchema = z.object({
  newDate: isoDateSchema,
  mode: rescheduleModeSchema.default("SINGLE"),
});
export type RescheduleSessionInput = z.infer<typeof rescheduleSessionSchema>;

export const cycleReviewActionSchema = z.enum(["REBUILD", "STOP"]);
export type CycleReviewAction = z.infer<typeof cycleReviewActionSchema>;

export const cycleReviewReasonSchema = z.enum(["LONG_PAUSE", "ILLNESS", "USER"]);
export type CycleReviewReason = z.infer<typeof cycleReviewReasonSchema>;

export const cycleReviewSchema = z.object({
  action: cycleReviewActionSchema,
  reason: cycleReviewReasonSchema,
});
export type CycleReviewInput = z.infer<typeof cycleReviewSchema>;

export const parseTextSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});
export type ParseTextInput = z.infer<typeof parseTextSchema>;

export const llmResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    parsedFacts: z.object({
      exerciseAlias: z.string().nullable(),
      exerciseVariantId: z.string().nullable(),
      targetBlockId: z.string().nullable(),
      role: roleSchema.nullable(),
      sets: z
        .array(
          z.object({
            weightKg: z.number().nullable(),
            assistanceKg: z.number().nullable(),
            addedKg: z.number().nullable(),
            reps: z.number().int().nullable(),
            rir: z.number().int().min(0).max(4).nullable(),
            setType: setTypeSchema.nullable(),
            sourceSpan: z.string().nullable(),
          }),
        )
        .max(30),
      sleepHours: z.number().nullable(),
      symptoms: z.array(z.string()).max(10),
    }),
    missingFields: z.array(z.string()).max(20),
    ambiguities: z
      .array(
        z.object({
          field: z.string(),
          question: z.string(),
        }),
      )
      .max(5),
    safetyObservations: z
      .array(
        z.object({
          code: safetyLabelSchema,
          quote: z.string(),
        }),
      )
      .max(10),
    selectedActionId: actionSchema.nullable(),
    explanation: z.string().max(3000),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type LlmResponse = z.infer<typeof llmResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const weekdaySchema = z.number().int().min(0).max(6);
