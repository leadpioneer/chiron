import {
  and,
  asc,
  desc,
  eq,
  inArray,
} from "drizzle-orm";
import type { OnboardingInput } from "@chiron/contracts";
import {
  buildPlan,
  cycleEndDate,
  daysBetween,
  generateSessionSchedule,
  type Exposure,
  type SetRecord,
  type VariantInfo,
} from "@chiron/core";
import {
  athleteProfiles,
  auditEvents,
  exerciseLibrary,
  exerciseVariants,
  exercises,
  getDb,
  planTemplates,
  planVersions,
  prescriptions,
  recommendations,
  sessions,
  sessionPrescriptionSkips,
  setPerformances,
  targetBlocks,
  trainingCycles,
  users,
} from "@chiron/db";
import { todayIso } from "./dates";

export class CycleAlreadyActiveError extends Error {
  constructor() {
    super("An active cycle already exists");
    this.name = "CycleAlreadyActiveError";
  }
}

export class CycleNotFinishedError extends Error {
  constructor() {
    super("The active cycle still has planned sessions");
    this.name = "CycleNotFinishedError";
  }
}

export class NoActiveCycleError extends Error {
  constructor() {
    super("No active cycle");
    this.name = "NoActiveCycleError";
  }
}

export interface ActiveCycle {
  id: string;
  userId: string;
  templateId: string;
  startDate: string;
  endDate: string;
  status: string;
  currentPlanVersionId: string | null;
  returnPhaseSessions: number;
  closeReason: string | null;
}

export async function getActiveCycle(
  userId: string,
): Promise<ActiveCycle | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(trainingCycles)
    .where(
      and(
        eq(trainingCycles.userId, userId),
        eq(trainingCycles.status, "ACTIVE"),
      ),
    )
    .orderBy(desc(trainingCycles.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getNextSession(
  cycleId: string,
): Promise<{
  id: string;
  sessionIndex: number;
  sessionKey: string;
  plannedDate: string;
  status: string;
  isReturn: boolean;
} | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: sessions.id,
      sessionIndex: sessions.sessionIndex,
      sessionKey: sessions.sessionKey,
      plannedDate: sessions.plannedDate,
      status: sessions.status,
      isReturn: sessions.isReturn,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.cycleId, cycleId),
        inArray(sessions.status, ["PLANNED", "IN_PROGRESS"]),
      ),
    )
    .orderBy(asc(sessions.sessionIndex))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCycleForUser(
  userId: string,
  input: OnboardingInput,
  options: { today?: string; actorUserId?: string } = {},
): Promise<string> {
  const db = getDb();
  const existing = await getActiveCycle(userId);
  if (existing) throw new CycleAlreadyActiveError();

  const templateRows = await db
    .select()
    .from(planTemplates)
    .where(eq(planTemplates.slug, "pull_push_2x"))
    .limit(1);
  const template = templateRows[0];
  if (!template) {
    throw new Error("Plan template is not seeded. Run npm run db:seed.");
  }

  const definition = template.definition;
  const slugs = new Set<string>();
  for (const session of definition.sessions) {
    for (const block of session.blocks) {
      for (const exercise of block.exercises) {
        slugs.add(exercise.variantSlug);
      }
    }
  }
  for (const aesthetic of definition.aesthetic) slugs.add(aesthetic.variantSlug);
  slugs.add(input.variants.verticalPull);
  slugs.add(input.variants.hinge);
  slugs.add(input.variants.squat);
  slugs.add(input.variants.press);

  const variantRows = await db
    .select({
      variant: exerciseVariants,
      exerciseName: exercises.name,
    })
    .from(exerciseVariants)
    .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
    .where(inArray(exerciseVariants.slug, [...slugs]));

  const variantsBySlug: Record<string, VariantInfo> = {};
  for (const row of variantRows) {
    variantsBySlug[row.variant.slug] = {
      id: row.variant.id,
      slug: row.variant.slug,
      name: row.variant.name,
      exerciseName: row.exerciseName,
      loadMode: row.variant.loadMode as VariantInfo["loadMode"],
      incrementKg: row.variant.incrementKg,
      pair: row.variant.pair,
      sides: row.variant.sides,
    };
  }

  const plan = buildPlan(definition, variantsBySlug, {
    variants: input.variants,
    accessories: input.accessories,
    aesthetic: input.aesthetic,
    startingLoads: input.startingLoads,
    breakWeeks: input.breakWeeks,
    bodyweightKg: input.bodyweightKg,
  });

  const startDate = options.today ?? todayIso();
  const endDate = cycleEndDate(startDate, 8);
  const schedule = generateSessionSchedule(
    startDate,
    input.trainingScheme,
    8,
  );

  return db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ displayName: input.displayName })
      .where(eq(users.id, userId));

    await tx
      .insert(athleteProfiles)
      .values({
        userId,
        experience: input.experience,
        goal: input.goal,
        bodyweightKg: input.bodyweightKg,
        heightCm: input.heightCm,
        bodyFatPercent: input.bodyFatPercent,
        trainingScheme: input.trainingScheme,
        trainingDays: null,
        breakWeeks: input.breakWeeks,
      })
      .onConflictDoUpdate({
        target: athleteProfiles.userId,
        set: {
          experience: input.experience,
          goal: input.goal,
          bodyweightKg: input.bodyweightKg,
          heightCm: input.heightCm,
          bodyFatPercent: input.bodyFatPercent,
          trainingScheme: input.trainingScheme,
          trainingDays: null,
          breakWeeks: input.breakWeeks,
          updatedAt: new Date(),
        },
      });

    const cycleRows = await tx
      .insert(trainingCycles)
      .values({
        userId,
        templateId: template.id,
        startDate,
        endDate,
        status: "ACTIVE",
      })
      .returning();
    const cycle = cycleRows[0];
    if (!cycle) throw new Error("Could not create cycle");

    const versionRows = await tx
      .insert(planVersions)
      .values({
        cycleId: cycle.id,
        version: 1,
        reason: "Старт цикла",
        rulesVersion: "1.0.0",
      })
      .returning();
    const version = versionRows[0];
    if (!version) throw new Error("Could not create plan version");

    for (const builtSession of plan.sessions) {
      const blockIdByKey = new Map<string, string>();
      for (const block of builtSession.blocks) {
        const insertedBlocks = await tx
          .insert(targetBlocks)
          .values({
            planVersionId: version.id,
            sessionKey: builtSession.key,
            key: block.key,
            name: block.name,
            goal: block.goal,
          })
          .returning();
        const inserted = insertedBlocks[0];
        if (!inserted) throw new Error("Could not insert target block");
        blockIdByKey.set(block.key, inserted.id);
      }

      const prescriptionIdByKey = new Map<string, string>();
      for (const item of builtSession.prescriptions) {
        const blockId = blockIdByKey.get(item.targetBlockKey);
        if (!blockId) {
          throw new Error(`Missing target block: ${item.targetBlockKey}`);
        }
        const insertedPrescriptions = await tx
          .insert(prescriptions)
          .values({
            planVersionId: version.id,
            targetBlockId: blockId,
            exerciseVariantId: item.variantId,
            role: item.role,
            sessionKey: builtSession.key,
            plannedOrder: item.plannedOrder,
            optional: item.optional,
            sets: item.sets,
            repMin: item.repMin,
            repMax: item.repMax,
            targetReps: item.targetReps,
            targetRir: item.targetRir,
            loadMode: item.loadMode,
            weightKg: item.weightKg,
            assistanceKg: item.assistanceKg,
            addedKg: item.addedKg,
            incrementKg: item.incrementKg,
            pair: item.pair,
            sides: item.sides,
          })
          .returning();
        const inserted = insertedPrescriptions[0];
        if (!inserted) throw new Error("Could not insert prescription");
        prescriptionIdByKey.set(item.key, inserted.id);
      }

      for (const item of builtSession.prescriptions) {
        const prescriptionId = prescriptionIdByKey.get(item.key);
        if (!prescriptionId) continue;
        if (item.supportsKey) {
          const supportsId = prescriptionIdByKey.get(item.supportsKey);
          if (supportsId) {
            await tx
              .update(prescriptions)
              .set({ supportsPrimaryId: supportsId })
              .where(eq(prescriptions.id, prescriptionId));
          }
        }
      }

      for (const block of builtSession.blocks) {
        if (!block.primaryKey) continue;
        const primaryId = prescriptionIdByKey.get(block.primaryKey);
        if (primaryId) {
          await tx
            .update(targetBlocks)
            .set({ primaryPrescriptionId: primaryId })
            .where(
              and(
                eq(targetBlocks.planVersionId, version.id),
                eq(targetBlocks.sessionKey, builtSession.key),
                eq(targetBlocks.key, block.key),
              ),
            );
        }
      }
    }

    for (const scheduled of schedule) {
      await tx.insert(sessions).values({
        cycleId: cycle.id,
        planVersionId: version.id,
        sessionIndex: scheduled.sessionIndex,
        sessionKey: scheduled.sessionKey,
        plannedDate: scheduled.plannedDate,
        status: "PLANNED",
      });
    }

    await tx
      .update(trainingCycles)
      .set({ currentPlanVersionId: version.id })
      .where(eq(trainingCycles.id, cycle.id));

    await tx.insert(auditEvents).values({
      userId,
      actorUserId: options.actorUserId ?? userId,
      entity: "training_cycle",
      entityId: cycle.id,
      eventType: "CYCLE_CREATED",
      payload: {
        template: definition.slug,
        startDate,
        endDate,
        sessions: schedule.length,
      },
      versions: { rules: "1.0.0", plan: 1 },
    });

    return cycle.id;
  });
}

export interface PrescriptionView {
  id: string;
  exerciseVariantId: string;
  exerciseName: string;
  variantName: string;
  role: string;
  targetBlockId: string;
  targetBlockKey: string;
  targetBlockName: string;
  supportsPrimaryId: string | null;
  plannedOrder: number;
  optional: boolean;
  sets: number;
  repMin: number;
  repMax: number;
  targetReps: number;
  targetRir: number;
  loadMode: string;
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
  incrementKg: number;
  pair: boolean;
  sides: number;
  lastSets: SetRecord[];
  technique: {
    nameRu: string | null;
    instructions: string[];
    equipmentRu: string | null;
    images: string[];
  } | null;
}

export interface BlockView {
  id: string;
  key: string;
  name: string;
  goal: string;
  primaryPrescriptionId: string | null;
  prescriptions: PrescriptionView[];
}

export interface SessionView {
  session: {
    id: string;
    cycleId: string;
    planVersionId: string;
    sessionIndex: number;
    sessionKey: string;
    plannedDate: string;
    actualDate: string | null;
    status: string;
    rescheduledFrom: string | null;
    isReturn: boolean;
  };
  cycle: ActiveCycle;
  blocks: BlockView[];
  sets: Array<{
    id: string;
    prescriptionId: string;
    clientSetId: string;
    setType: string;
    weightKg: number | null;
    assistanceKg: number | null;
    addedKg: number | null;
    reps: number;
    rir: number | null;
    technique: string;
    pain: boolean;
    completed: boolean;
    actualOrder: number;
  }>;
}

export async function getSessionView(
  sessionId: string,
  userId: string,
  options: { today?: string } = {},
): Promise<SessionView | null> {
  const db = getDb();
  const rows = await db
    .select({
      session: sessions,
      cycle: trainingCycles,
    })
    .from(sessions)
    .innerJoin(trainingCycles, eq(sessions.cycleId, trainingCycles.id))
    .where(
      and(eq(sessions.id, sessionId), eq(trainingCycles.userId, userId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const cycle = row.cycle as ActiveCycle;
  const blockRows = await db
    .select()
    .from(targetBlocks)
    .where(
      and(
        eq(targetBlocks.planVersionId, row.session.planVersionId),
        eq(targetBlocks.sessionKey, row.session.sessionKey),
      ),
    );

  const prescriptionRows = await db
    .select({
      prescription: prescriptions,
      variant: exerciseVariants,
      exerciseName: exercises.name,
      libraryNameRu: exerciseLibrary.nameRu,
      libraryInstructions: exerciseLibrary.instructionsRu,
      libraryEquipmentRu: exerciseLibrary.equipmentRu,
      libraryImages: exerciseLibrary.images,
    })
    .from(prescriptions)
    .innerJoin(
      exerciseVariants,
      eq(prescriptions.exerciseVariantId, exerciseVariants.id),
    )
    .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
    .leftJoin(
      exerciseLibrary,
      eq(exerciseVariants.libraryId, exerciseLibrary.id),
    )
    .where(
      and(
        eq(prescriptions.planVersionId, row.session.planVersionId),
        eq(prescriptions.sessionKey, row.session.sessionKey),
      ),
    )
    .orderBy(asc(prescriptions.plannedOrder));

  const setRows = await db
    .select()
    .from(setPerformances)
    .where(eq(setPerformances.sessionId, sessionId))
    .orderBy(asc(setPerformances.actualOrder));

  const skipRows = await db
    .select({ prescriptionId: sessionPrescriptionSkips.prescriptionId })
    .from(sessionPrescriptionSkips)
    .where(eq(sessionPrescriptionSkips.sessionId, sessionId));
  const skippedPrescriptions = new Set(
    skipRows.map((row) => row.prescriptionId),
  );

  const blockOrder = new Map<string, number>();
  for (const item of prescriptionRows) {
    const current = blockOrder.get(item.prescription.targetBlockId);
    if (current === undefined || item.prescription.plannedOrder < current) {
      blockOrder.set(
        item.prescription.targetBlockId,
        item.prescription.plannedOrder,
      );
    }
  }

  const blocks: BlockView[] = [];
  const blockById = new Map<string, BlockView>();
  for (const block of [...blockRows].sort(
    (a, b) => (blockOrder.get(a.id) ?? 999) - (blockOrder.get(b.id) ?? 999),
  )) {
    const view: BlockView = {
      id: block.id,
      key: block.key,
      name: block.name,
      goal: block.goal,
      primaryPrescriptionId: block.primaryPrescriptionId,
      prescriptions: [],
    };
    blocks.push(view);
    blockById.set(block.id, view);
  }

  for (const item of prescriptionRows) {
    if (skippedPrescriptions.has(item.prescription.id)) continue;
    const block = blockById.get(item.prescription.targetBlockId);
    if (!block) continue;
    const exposures = await getExposuresForVariant(
      cycle.id,
      item.prescription.exerciseVariantId,
      { excludeSessionId: sessionId, limit: 1, today: options.today },
    );
    block.prescriptions.push({
      id: item.prescription.id,
      exerciseVariantId: item.prescription.exerciseVariantId,
      exerciseName: item.exerciseName,
      variantName: item.variant.name,
      role: item.prescription.role,
      targetBlockId: item.prescription.targetBlockId,
      targetBlockKey: block.key,
      targetBlockName: block.name,
      supportsPrimaryId: item.prescription.supportsPrimaryId,
      plannedOrder: item.prescription.plannedOrder,
      optional: item.prescription.optional,
      sets: item.prescription.sets,
      repMin: item.prescription.repMin,
      repMax: item.prescription.repMax,
      targetReps: item.prescription.targetReps,
      targetRir: item.prescription.targetRir,
      loadMode: item.prescription.loadMode,
      weightKg: item.prescription.weightKg,
      assistanceKg: item.prescription.assistanceKg,
      addedKg: item.prescription.addedKg,
      incrementKg: item.prescription.incrementKg,
      pair: item.prescription.pair,
      sides: item.prescription.sides,
      lastSets: exposures[0]?.sets ?? [],
      technique:
        item.libraryNameRu ||
        (item.libraryInstructions && item.libraryInstructions.length > 0)
          ? {
              nameRu: item.libraryNameRu ?? null,
              instructions: item.libraryInstructions ?? [],
              equipmentRu: item.libraryEquipmentRu ?? null,
              images: item.libraryImages ?? [],
            }
          : null,
    });
  }

  return {
    session: row.session,
    cycle,
    blocks: blocks.filter((block) => block.prescriptions.length > 0),
    sets: setRows,
  };
}

export async function getExposuresForVariant(
  cycleId: string,
  exerciseVariantId: string,
  options: { limit?: number; excludeSessionId?: string; today?: string } = {},
): Promise<Exposure[]> {
  const db = getDb();
  const rows = await db
    .select({
      sessionId: sessions.id,
      actualDate: sessions.actualDate,
      plannedDate: sessions.plannedDate,
      isReturn: sessions.isReturn,
      set: setPerformances,
      prescription: prescriptions,
    })
    .from(setPerformances)
    .innerJoin(sessions, eq(setPerformances.sessionId, sessions.id))
    .innerJoin(
      prescriptions,
      eq(setPerformances.prescriptionId, prescriptions.id),
    )
    .where(
      and(
        eq(sessions.cycleId, cycleId),
        eq(prescriptions.exerciseVariantId, exerciseVariantId),
        eq(sessions.status, "COMPLETED"),
      ),
    )
    .orderBy(
      desc(sessions.actualDate),
      desc(sessions.sessionIndex),
      asc(setPerformances.actualOrder),
    );

  const bySession = new Map<string, Exposure>();
  const today = options.today ?? todayIso();
  const cutoff =
    Date.parse(`${today}T00:00:00.000Z`) - 42 * 86_400_000;

  for (const row of rows) {
    if (options.excludeSessionId && row.sessionId === options.excludeSessionId) {
      continue;
    }
    const date = row.actualDate ?? row.plannedDate;
    if (Date.parse(`${date}T00:00:00Z`) < cutoff) continue;
    const existing = bySession.get(row.sessionId);
    const set: SetRecord = {
      setType: row.set.setType as SetRecord["setType"],
      weightKg: row.set.weightKg,
      assistanceKg: row.set.assistanceKg,
      addedKg: row.set.addedKg,
      reps: row.set.reps,
      rir: row.set.rir,
      technique: row.set.technique as SetRecord["technique"],
      pain: row.set.pain,
      completed: row.set.completed,
      actualOrder: row.set.actualOrder,
    };
    if (existing) {
      existing.sets.push(set);
    } else {
      bySession.set(row.sessionId, {
        id: row.sessionId,
        date,
        sets: [set],
        plannedSets: row.prescription.sets,
        plannedRepMin: row.prescription.repMin,
        plannedRepMax: row.prescription.repMax,
        targetReps: row.prescription.targetReps,
        targetRir: row.prescription.targetRir,
        duringReturn: row.isReturn,
      });
    }
  }

  const exposures = [...bySession.values()].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  return exposures.slice(0, options.limit ?? 5);
}

export async function getTemplateForCycle(
  templateId: string,
): Promise<{ slug: string; name: string; description: string } | null> {
  const db = getDb();
  const rows = await db
    .select({
      slug: planTemplates.slug,
      name: planTemplates.name,
      description: planTemplates.description,
    })
    .from(planTemplates)
    .where(eq(planTemplates.id, templateId))
    .limit(1);
  return rows[0] ?? null;
}


export async function advanceCycle(
  userId: string,
  options: { today?: string; actorUserId?: string } = {},
): Promise<string> {
  const db = getDb();
  const today = options.today ?? todayIso();
  const cycle = await getActiveCycle(userId);
  if (!cycle) throw new NoActiveCycleError();
  const next = await getNextSession(cycle.id);
  if (next) throw new CycleNotFinishedError();

  const versionId = cycle.currentPlanVersionId;
  if (!versionId) throw new Error("Cycle has no current plan version");

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const profileRows = await db
    .select()
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, userId))
    .limit(1);
  const profile = profileRows[0];
  const user = userRows[0];
  if (!user) throw new Error("User not found");

  const rows = await db
    .select({
      prescription: prescriptions,
      variantSlug: exerciseVariants.slug,
      blockKey: targetBlocks.key,
    })
    .from(prescriptions)
    .innerJoin(
      exerciseVariants,
      eq(prescriptions.exerciseVariantId, exerciseVariants.id),
    )
    .innerJoin(targetBlocks, eq(prescriptions.targetBlockId, targetBlocks.id))
    .where(eq(prescriptions.planVersionId, versionId));

  const primaryByBlock = new Map<string, (typeof rows)[number]>();
  const accessories = {
    row: false,
    pullover: false,
    legExtension: false,
    pecDeck: false,
  };
  const aesthetic: string[] = [];

  for (const row of rows) {
    if (row.prescription.role === "PRIMARY") {
      primaryByBlock.set(row.blockKey, row);
    } else if (row.prescription.role === "ACCESSORY") {
      if (row.blockKey === "vertical_pull") {
        if (row.variantSlug === "seated_cable_row") accessories.row = true;
        if (row.variantSlug === "dumbbell_pullover") accessories.pullover = true;
      }
      if (row.blockKey === "squat" && row.variantSlug === "leg_extension") {
        accessories.legExtension = true;
      }
      if (row.blockKey === "press" && row.variantSlug === "pec_deck") {
        accessories.pecDeck = true;
      }
    } else if (row.prescription.role === "AESTHETIC") {
      aesthetic.push(row.variantSlug);
    }
  }

  function primarySlug(blockKey: string, fallback: string): string {
    return primaryByBlock.get(blockKey)?.variantSlug ?? fallback;
  }

  function primaryLoad(blockKey: string, field: "weight" | "assistance"): number | null {
    const row = primaryByBlock.get(blockKey);
    if (!row) return null;
    return field === "assistance"
      ? row.prescription.assistanceKg
      : row.prescription.weightKg;
  }

  const verticalRow = primaryByBlock.get("vertical_pull");
  const verticalAssisted = verticalRow?.prescription.loadMode === "ASSISTED";

  const sessionRows = await db
    .select({
      actualDate: sessions.actualDate,
      plannedDate: sessions.plannedDate,
      status: sessions.status,
      sessionKey: sessions.sessionKey,
    })
    .from(sessions)
    .where(eq(sessions.cycleId, cycle.id));
  const completedDates = sessionRows
    .filter((row) => row.status === "COMPLETED")
    .map((row) => row.actualDate ?? row.plannedDate)
    .sort();
  const lastDate = completedDates.at(-1) ?? cycle.startDate;
  const gapDays = daysBetween(lastDate, today);
  const gapWeeks =
    gapDays === null ? null : Math.min(520, Math.floor(gapDays / 7));
  const breakWeeks = gapWeeks !== null && gapWeeks > 2 ? gapWeeks : null;
  const completedSessions = sessionRows.filter(
    (row) => row.status === "COMPLETED",
  ).length;
  const completedA = sessionRows.filter(
    (row) => row.status === "COMPLETED" && row.sessionKey === "A",
  ).length;
  const completedB = sessionRows.filter(
    (row) => row.status === "COMPLETED" && row.sessionKey === "B",
  ).length;
  const cycleStatus =
    Math.min(completedA, completedB) >= 8 ? "COMPLETED" : "INCOMPLETE";

  await db
    .update(trainingCycles)
    .set({ status: cycleStatus, completedAt: new Date() })
    .where(eq(trainingCycles.id, cycle.id));

  let newCycleId: string;
  try {
    newCycleId = await createCycleForUser(userId, {
      displayName: user.displayName,
      experience: (profile?.experience ?? "RETURNING") as OnboardingInput["experience"],
      goal: (profile?.goal ?? "BOTH") as OnboardingInput["goal"],
      bodyweightKg: profile?.bodyweightKg ?? null,
      heightCm: profile?.heightCm ?? null,
      bodyFatPercent: profile?.bodyFatPercent ?? null,
      breakWeeks,
      trainingScheme: (profile?.trainingScheme ??
        "EVERY_OTHER_DAY") as OnboardingInput["trainingScheme"],
      variants: {
        verticalPull: primarySlug("vertical_pull", "assisted_pull_up") as OnboardingInput["variants"]["verticalPull"],
        hinge: primarySlug("posterior_chain", "barbell_rdl") as OnboardingInput["variants"]["hinge"],
        squat: primarySlug("squat", "front_squat") as OnboardingInput["variants"]["squat"],
        press: primarySlug("press", "barbell_bench") as OnboardingInput["variants"]["press"],
      },
      accessories,
      aesthetic: aesthetic as OnboardingInput["aesthetic"],
      startingLoads: {
        verticalPull: verticalAssisted
          ? primaryLoad("vertical_pull", "assistance")
          : primaryLoad("vertical_pull", "weight"),
        hinge: primaryLoad("posterior_chain", "weight"),
        squat: primaryLoad("squat", "weight"),
        press: primaryLoad("press", "weight"),
      },
    }, { today, actorUserId: options.actorUserId });
  } catch (error) {
    // Put the old cycle back if the new one could not be created.
    await db
      .update(trainingCycles)
      .set({ status: "ACTIVE", completedAt: null })
      .where(eq(trainingCycles.id, cycle.id));
    throw error;
  }

  await db
    .update(recommendations)
    .set({ status: "EXPIRED" })
    .where(
      and(
        eq(recommendations.cycleId, cycle.id),
        eq(recommendations.status, "PENDING"),
      ),
    );
  await db.insert(auditEvents).values({
    userId,
    actorUserId: options.actorUserId ?? userId,
    entity: "training_cycle",
    entityId: cycle.id,
    eventType: "CYCLE_CLOSED",
    payload: { lastDate, nextCycle: true, completedSessions, cycleStatus },
    versions: { rules: "1.0.0" },
  });

  return newCycleId;
}
