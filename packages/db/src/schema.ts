import type { TemplateDefinition } from "@chiron/core";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").unique(),
    displayName: text("display_name").notNull(),
    locale: text("locale").notNull().default("ru"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

export const identities = pgTable(
  "identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("identities_provider_user_idx").on(
      table.provider,
      table.providerUserId,
    ),
    index("identities_user_idx").on(table.userId),
  ],
);

export const coachMentees = pgTable(
  "coach_mentees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coachUserId: uuid("coach_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    menteeUserId: uuid("mentee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("ACTIVE"),
    permissions: text("permissions").notNull().default("WRITE"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("coach_mentees_pair_idx").on(
      table.coachUserId,
      table.menteeUserId,
    ),
    index("coach_mentees_coach_idx").on(table.coachUserId, table.status),
    index("coach_mentees_mentee_idx").on(table.menteeUserId),
  ],
);

export const athleteProfiles = pgTable(
  "athlete_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    experience: text("experience").notNull(),
    goal: text("goal").notNull(),
    bodyweightKg: doublePrecision("bodyweight_kg"),
    heightCm: doublePrecision("height_cm"),
    bodyFatPercent: doublePrecision("body_fat_percent"),
    trainingScheme: text("training_scheme").notNull().default("EVERY_OTHER_DAY"),
    trainingDays: jsonb("training_days").$type<[number, number]>(),
    breakWeeks: integer("break_weeks"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    pattern: text("pattern").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  },
);

export const exerciseLibrary = pgTable(
  "exercise_library",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nameRu: text("name_ru"),
    aliasesRu: jsonb("aliases_ru").$type<string[]>().notNull().default([]),
    force: text("force"),
    level: text("level"),
    mechanic: text("mechanic"),
    equipment: text("equipment"),
    equipmentRu: text("equipment_ru"),
    category: text("category"),
    categoryRu: text("category_ru"),
    primaryMuscles: jsonb("primary_muscles")
      .$type<string[]>()
      .notNull()
      .default([]),
    secondaryMuscles: jsonb("secondary_muscles")
      .$type<string[]>()
      .notNull()
      .default([]),
    primaryMusclesRu: jsonb("primary_muscles_ru")
      .$type<string[]>()
      .notNull()
      .default([]),
    secondaryMusclesRu: jsonb("secondary_muscles_ru")
      .$type<string[]>()
      .notNull()
      .default([]),
    instructionsRu: jsonb("instructions_ru")
      .$type<string[]>()
      .notNull()
      .default([]),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    reviewStatus: text("review_status"),
    instructionsStatus: text("instructions_status"),
    sourceUrl: text("source_url"),
    importedAt: timestamp("imported_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("exercise_library_name_ru_idx").on(table.nameRu)],
);

export const exerciseVariants = pgTable(
  "exercise_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    libraryId: text("library_id").references(() => exerciseLibrary.id, {
      onDelete: "set null",
    }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    equipment: text("equipment").notNull(),
    loadMode: text("load_mode").notNull(),
    incrementKg: doublePrecision("increment_kg").notNull().default(2.5),
    pair: boolean("pair").notNull().default(false),
    sides: integer("sides").notNull().default(1),
  },
  (table) => [index("variants_exercise_idx").on(table.exerciseId)],
);

export const planTemplates = pgTable("plan_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  definition: jsonb("definition").$type<TemplateDefinition>().notNull(),
  rulesVersion: text("rules_version").notNull().default("1.0.0"),
});

export const trainingCycles = pgTable(
  "training_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => planTemplates.id, { onDelete: "restrict" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    status: text("status").notNull().default("ACTIVE"),
    currentPlanVersionId: uuid("current_plan_version_id"),
    returnPhaseSessions: integer("return_phase_sessions").notNull().default(0),
    closeReason: text("close_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("cycles_user_idx").on(table.userId, table.status)],
);

export const planVersions = pgTable(
  "plan_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => trainingCycles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    parentVersionId: uuid("parent_version_id"),
    reason: text("reason").notNull(),
    decisionId: uuid("decision_id"),
    rulesVersion: text("rules_version").notNull().default("1.0.0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("plan_versions_cycle_version_idx").on(
      table.cycleId,
      table.version,
    ),
  ],
);

export const targetBlocks = pgTable(
  "target_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planVersionId: uuid("plan_version_id")
      .notNull()
      .references(() => planVersions.id, { onDelete: "cascade" }),
    sessionKey: text("session_key").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    goal: text("goal").notNull(),
    primaryPrescriptionId: uuid("primary_prescription_id"),
    progressionPolicy: text("progression_policy").notNull().default("DOUBLE"),
  },
  (table) => [
    uniqueIndex("target_blocks_version_session_key_idx").on(
      table.planVersionId,
      table.sessionKey,
      table.key,
    ),
  ],
);

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planVersionId: uuid("plan_version_id")
      .notNull()
      .references(() => planVersions.id, { onDelete: "cascade" }),
    targetBlockId: uuid("target_block_id")
      .notNull()
      .references(() => targetBlocks.id, { onDelete: "cascade" }),
    exerciseVariantId: uuid("exercise_variant_id")
      .notNull()
      .references(() => exerciseVariants.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    supportsPrimaryId: uuid("supports_primary_id"),
    sessionKey: text("session_key").notNull(),
    plannedOrder: integer("planned_order").notNull(),
    optional: boolean("optional").notNull().default(false),
    sets: integer("sets").notNull(),
    repMin: integer("rep_min").notNull(),
    repMax: integer("rep_max").notNull(),
    targetReps: integer("target_reps").notNull(),
    targetRir: integer("target_rir").notNull(),
    loadMode: text("load_mode").notNull(),
    weightKg: doublePrecision("weight_kg"),
    assistanceKg: doublePrecision("assistance_kg"),
    addedKg: doublePrecision("added_kg"),
    incrementKg: doublePrecision("increment_kg").notNull(),
    pair: boolean("pair").notNull().default(false),
    sides: integer("sides").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("prescriptions_version_session_idx").on(
      table.planVersionId,
      table.sessionKey,
      table.plannedOrder,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => trainingCycles.id, { onDelete: "cascade" }),
    planVersionId: uuid("plan_version_id")
      .notNull()
      .references(() => planVersions.id, { onDelete: "restrict" }),
    sessionIndex: integer("session_index").notNull(),
    sessionKey: text("session_key").notNull(),
    plannedDate: date("planned_date", { mode: "string" }).notNull(),
    actualDate: date("actual_date", { mode: "string" }),
    status: text("status").notNull().default("PLANNED"),
    rescheduledFrom: date("rescheduled_from", { mode: "string" }),
    isReturn: boolean("is_return").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("sessions_cycle_index_idx").on(
      table.cycleId,
      table.sessionIndex,
    ),
    index("sessions_cycle_date_idx").on(table.cycleId, table.plannedDate),
  ],
);

export const setPerformances = pgTable(
  "set_performances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    prescriptionId: uuid("prescription_id")
      .notNull()
      .references(() => prescriptions.id, { onDelete: "restrict" }),
    clientSetId: uuid("client_set_id").notNull(),
    setType: text("set_type").notNull(),
    weightKg: doublePrecision("weight_kg"),
    assistanceKg: doublePrecision("assistance_kg"),
    addedKg: doublePrecision("added_kg"),
    reps: integer("reps").notNull(),
    rir: integer("rir"),
    technique: text("technique").notNull().default("NORMAL"),
    pain: boolean("pain").notNull().default(false),
    completed: boolean("completed").notNull().default(true),
    actualOrder: integer("actual_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("set_performances_client_idx").on(
      table.sessionId,
      table.clientSetId,
    ),
    index("set_performances_prescription_idx").on(table.prescriptionId),
  ],
);

export const sessionPrescriptionSkips = pgTable(
  "session_prescription_skips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    prescriptionId: uuid("prescription_id")
      .notNull()
      .references(() => prescriptions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("session_prescription_skips_pair_idx").on(
      table.sessionId,
      table.prescriptionId,
    ),
  ],
);

export const sessionPerformances = pgTable(
  "session_performances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .unique()
      .references(() => sessions.id, { onDelete: "cascade" }),
    sessionRpe: text("session_rpe").notNull(),
    comment: text("comment"),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const wellnessChecks = pgTable(
  "wellness_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    recordedAt: date("recorded_at", { mode: "string" }).notNull(),
    sleepHours: doublePrecision("sleep_hours"),
    sleepQuality: integer("sleep_quality"),
    fatigue: integer("fatigue"),
    stress: integer("stress"),
    motivation: integer("motivation"),
    soreness: text("soreness"),
    symptom: boolean("symptom"),
    symptomText: text("symptom_text"),
    illness: text("illness"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("wellness_user_date_idx").on(table.userId, table.recordedAt)],
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => trainingCycles.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    status: text("status").notNull().default("PENDING"),
    explanation: text("explanation").notNull(),
    candidates: jsonb("candidates").$type<unknown>().notNull(),
    evidence: jsonb("evidence").$type<unknown>().notNull(),
    rulesVersion: text("rules_version").notNull(),
    promptVersion: text("prompt_version"),
    modelVersion: text("model_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("recommendations_cycle_status_idx").on(
      table.cycleId,
      table.status,
    ),
  ],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => recommendations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    outcome: text("outcome").notNull(),
    reasonCategory: text("reason_category"),
    comment: text("comment"),
    before: jsonb("before").$type<unknown>().notNull(),
    after: jsonb("after").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const safetyEvents = pgTable(
  "safety_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    severity: text("severity").notNull(),
    source: text("source").notNull(),
    scope: text("scope").notNull(),
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("safety_events_user_idx").on(table.userId, table.createdAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    versions: jsonb("versions").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("audit_user_idx").on(table.userId, table.createdAt)],
);

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    rulesVersion: text("rules_version").notNull(),
    inputHash: text("input_hash").notNull(),
    output: jsonb("output").$type<unknown>(),
    validation: text("validation").notNull(),
    latencyMs: integer("latency_ms"),
    costUsd: doublePrecision("cost_usd"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    response: jsonb("response").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_user_key_idx").on(table.userId, table.key),
  ],
);
