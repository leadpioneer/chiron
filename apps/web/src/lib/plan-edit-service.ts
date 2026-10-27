import { and, asc, eq, inArray, max } from "drizzle-orm";
import { exerciseBlockRule } from "@chiron/core";
import {
  auditEvents,
  decisions,
  exerciseLibrary,
  exerciseVariants,
  exercises,
  getDb,
  planVersions,
  prescriptions,
  recommendations,
  sessions,
  sessionPrescriptionSkips,
  setPerformances,
  targetBlocks,
  trainingCycles,
} from "@chiron/db";
import { getActiveCycle } from "./plan-service";

export class PlanEditError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "PlanEditError";
  }
}

export interface ExerciseOption {
  variantId: string;
  variantSlug: string;
  variantName: string;
  exerciseName: string;
  blockKey: string;
  primaryEligible: boolean;
  loadMode: string;
  equipment: string;
}

export async function getExerciseOptions(): Promise<ExerciseOption[]> {
  const rows = await getDb()
    .select({
      variant: exerciseVariants,
      exerciseName: exercises.name,
    })
    .from(exerciseVariants)
    .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
    .orderBy(asc(exercises.name), asc(exerciseVariants.name));

  const options: ExerciseOption[] = [];
  for (const row of rows) {
    const rule = exerciseBlockRule(row.variant.slug);
    if (!rule) continue;
    options.push({
      variantId: row.variant.id,
      variantSlug: row.variant.slug,
      variantName: row.variant.name,
      exerciseName: row.exerciseName,
      blockKey: rule.blockKey,
      primaryEligible: rule.primaryEligible,
      loadMode: row.variant.loadMode,
      equipment: row.variant.equipment,
    });
  }
  return options;
}

interface ExerciseSnapshot {
  prescriptionId: string;
  exerciseVariantId: string;
  variantSlug: string;
  exerciseName: string;
  variantName: string;
  role: string;
  sets: number;
  targetReps: number;
  loadMode: string;
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
}

export interface ReplaceExerciseResult {
  planVersionId: string;
  version: number;
  prescriptionId: string;
  from: ExerciseSnapshot;
  to: ExerciseSnapshot;
}

function snapshot(input: {
  prescriptionId: string;
  exerciseVariantId: string;
  variantSlug: string;
  exerciseName: string;
  variantName: string;
  role: string;
  sets: number;
  targetReps: number;
  loadMode: string;
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
}): ExerciseSnapshot {
  return { ...input };
}

function libraryVariantSlug(libraryId: string): string {
  return `lib_${libraryId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function inferLibraryLoadMode(
  row: typeof exerciseLibrary.$inferSelect,
): "EXTERNAL" | "ASSISTED" | "BODYWEIGHT" | "BODYWEIGHT_PLUS" {
  const name = (row.nameRu ?? row.name).toLowerCase();
  const equipment = (row.equipment ?? "").toLowerCase();
  if (/assisted|с помощью|помощ|резин/.test(name) || equipment === "bands") {
    return "ASSISTED";
  }
  if (
    /weighted|с дополнительным весом|с отягощением|отягощ/.test(name)
  ) {
    return "BODYWEIGHT_PLUS";
  }
  if (equipment === "body only" || equipment === "") {
    return "BODYWEIGHT";
  }
  return "EXTERNAL";
}

export async function ensureLibraryVariant(
  row: typeof exerciseLibrary.$inferSelect,
  actor: { userId: string; actorUserId?: string },
): Promise<{
  variant: typeof exerciseVariants.$inferSelect;
  exerciseName: string;
}> {
  const existing = await getDb()
    .select({
      variant: exerciseVariants,
      exerciseName: exercises.name,
    })
    .from(exerciseVariants)
    .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
    .where(eq(exerciseVariants.libraryId, row.id))
    .limit(1);
  if (existing[0]) return existing[0];

  const name = row.nameRu ?? row.name;
  const slug = libraryVariantSlug(row.id);
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx
      .insert(exercises)
      .values({
        slug,
        name,
        pattern: row.category ?? row.force ?? "strength",
        aliases: row.aliasesRu,
      })
      .onConflictDoNothing();
    const exerciseRows = await tx
      .select()
      .from(exercises)
      .where(eq(exercises.slug, slug))
      .limit(1);
    const exercise = exerciseRows[0];
    if (!exercise) {
      throw new PlanEditError(
        "LIBRARY_EXERCISE_FAILED",
        "Не удалось добавить упражнение из базы",
        500,
      );
    }

    const insertedVariants = await tx
      .insert(exerciseVariants)
      .values({
        exerciseId: exercise.id,
        libraryId: row.id,
        slug,
        name,
        equipment: row.equipmentRu ?? row.equipment ?? "other",
        loadMode: inferLibraryLoadMode(row),
        incrementKg: 2.5,
        pair: false,
        sides: 1,
      })
      .onConflictDoNothing()
      .returning({ id: exerciseVariants.id });
    const variantRows = await tx
      .select()
      .from(exerciseVariants)
      .where(eq(exerciseVariants.slug, slug))
      .limit(1);
    const variant = variantRows[0];
    if (!variant) {
      throw new PlanEditError(
        "LIBRARY_EXERCISE_FAILED",
        "Не удалось добавить вариант упражнения",
        500,
      );
    }
    if (insertedVariants.length > 0) {
      await tx.insert(auditEvents).values({
        userId: actor.userId,
        actorUserId: actor.actorUserId ?? actor.userId,
        entity: "exercise_variant",
        entityId: variant.id,
        eventType: "LIBRARY_EXERCISE_ADDED",
        payload: {
          libraryId: row.id,
          name,
          loadMode: variant.loadMode,
        },
        versions: { rules: "1.0.0" },
      });
    }
    return { variant, exerciseName: exercise.name };
  });
}

export type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

interface PlanCopyResult {
  blockIdMap: Map<string, string>;
  prescriptionIdMap: Map<string, string>;
}

export async function copyPlanVersion(
  tx: DbTransaction,
  input: {
    cycleId: string;
    currentVersionId: string;
    newVersionId: string;
    nextVersion: number;
    reason: string;
    decisionId: string;
  },
): Promise<PlanCopyResult> {
  await tx.insert(planVersions).values({
    id: input.newVersionId,
    cycleId: input.cycleId,
    version: input.nextVersion,
    parentVersionId: input.currentVersionId,
    reason: input.reason,
    decisionId: input.decisionId,
    rulesVersion: "1.0.0",
  });

  const oldBlocks = await tx
    .select()
    .from(targetBlocks)
    .where(eq(targetBlocks.planVersionId, input.currentVersionId));
  const blockIdMap = new Map<string, string>();
  for (const block of oldBlocks) {
    const id = crypto.randomUUID();
    blockIdMap.set(block.id, id);
    await tx.insert(targetBlocks).values({
      id,
      planVersionId: input.newVersionId,
      sessionKey: block.sessionKey,
      key: block.key,
      name: block.name,
      goal: block.goal,
      primaryPrescriptionId: null,
      progressionPolicy: block.progressionPolicy,
    });
  }

  const oldPrescriptions = await tx
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.planVersionId, input.currentVersionId));
  const prescriptionIdMap = new Map<string, string>();
  for (const item of oldPrescriptions) {
    const id = crypto.randomUUID();
    prescriptionIdMap.set(item.id, id);
    const targetBlockId = blockIdMap.get(item.targetBlockId);
    if (!targetBlockId) {
      throw new PlanEditError(
        "BROKEN_PLAN",
        "У назначения отсутствует целевой блок",
        500,
      );
    }
    await tx.insert(prescriptions).values({
      id,
      planVersionId: input.newVersionId,
      targetBlockId,
      exerciseVariantId: item.exerciseVariantId,
      role: item.role,
      supportsPrimaryId: null,
      sessionKey: item.sessionKey,
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
    });
  }

  for (const item of oldPrescriptions) {
    const newId = prescriptionIdMap.get(item.id);
    if (!newId) continue;
    if (item.supportsPrimaryId) {
      const supportsId = prescriptionIdMap.get(item.supportsPrimaryId);
      if (supportsId) {
        await tx
          .update(prescriptions)
          .set({ supportsPrimaryId: supportsId })
          .where(eq(prescriptions.id, newId));
      }
    }
  }

  for (const block of oldBlocks) {
    if (!block.primaryPrescriptionId) continue;
    const newBlockId = blockIdMap.get(block.id);
    const newPrimaryId = prescriptionIdMap.get(
      block.primaryPrescriptionId,
    );
    if (newBlockId && newPrimaryId) {
      await tx
        .update(targetBlocks)
        .set({ primaryPrescriptionId: newPrimaryId })
        .where(eq(targetBlocks.id, newBlockId));
    }
  }

  return { blockIdMap, prescriptionIdMap };
}

export async function activatePlanVersion(
  tx: DbTransaction,
  input: {
    cycleId: string;
    newVersionId: string;
    prescriptionIdMap: Map<string, string>;
    touchedPrescriptionIds?: string[];
    removedPrescriptionId?: string;
    forbidSetsPrescriptionId?: string;
  },
): Promise<void> {
  await tx
    .update(trainingCycles)
    .set({ currentPlanVersionId: input.newVersionId })
    .where(eq(trainingCycles.id, input.cycleId));

  const activeSessions = await tx
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(
      and(
        eq(sessions.cycleId, input.cycleId),
        inArray(sessions.status, ["PLANNED", "IN_PROGRESS"]),
      ),
    )
    .for("update");
  const inProgressIds = activeSessions
    .filter((session) => session.status === "IN_PROGRESS")
    .map((session) => session.id);

  if (inProgressIds.length > 0 && input.forbidSetsPrescriptionId) {
    const blocked = await tx
      .select({ id: setPerformances.id })
      .from(setPerformances)
      .where(
        and(
          inArray(setPerformances.sessionId, inProgressIds),
          eq(
            setPerformances.prescriptionId,
            input.forbidSetsPrescriptionId,
          ),
        ),
      )
      .limit(1);
    if (blocked.length > 0) {
      throw new PlanEditError(
        "EXERCISE_HAS_SETS",
        "По этому упражнению уже есть подходы; замена недоступна",
        409,
      );
    }
  }

  if (inProgressIds.length > 0) {
    const activeSets = await tx
      .select({
        id: setPerformances.id,
        prescriptionId: setPerformances.prescriptionId,
      })
      .from(setPerformances)
      .where(inArray(setPerformances.sessionId, inProgressIds))
      .for("update");
    for (const item of activeSets) {
      if (item.prescriptionId === input.removedPrescriptionId) {
        throw new PlanEditError(
          "EXERCISE_HAS_SETS",
          "По упражнению уже есть подходы; удаление недоступно",
          409,
        );
      }
      const mapped = input.prescriptionIdMap.get(item.prescriptionId);
      if (!mapped) {
        throw new PlanEditError(
          "BROKEN_PLAN",
          "Не удалось перенести подходы на новую версию плана",
          500,
        );
      }
      await tx
        .update(setPerformances)
        .set({ prescriptionId: mapped })
        .where(eq(setPerformances.id, item.id));
    }
  }

  const activeSessionIds = activeSessions.map((session) => session.id);
  if (input.removedPrescriptionId) {
    await tx
      .delete(sessionPrescriptionSkips)
      .where(
        and(
          inArray(sessionPrescriptionSkips.sessionId, activeSessionIds),
          eq(
            sessionPrescriptionSkips.prescriptionId,
            input.removedPrescriptionId,
          ),
        ),
      );
  }
  const activeSkips = await tx
    .select({
      id: sessionPrescriptionSkips.id,
      prescriptionId: sessionPrescriptionSkips.prescriptionId,
    })
    .from(sessionPrescriptionSkips)
    .where(inArray(sessionPrescriptionSkips.sessionId, activeSessionIds))
    .for("update");
  for (const item of activeSkips) {
    const mapped = input.prescriptionIdMap.get(item.prescriptionId);
    if (!mapped) {
      throw new PlanEditError(
        "BROKEN_PLAN",
        "Не удалось перенести пропуски упражнений",
        500,
      );
    }
    await tx
      .update(sessionPrescriptionSkips)
      .set({ prescriptionId: mapped })
      .where(eq(sessionPrescriptionSkips.id, item.id));
  }

  await tx
    .update(sessions)
    .set({ planVersionId: input.newVersionId })
    .where(
      and(
        eq(sessions.cycleId, input.cycleId),
        inArray(sessions.status, ["PLANNED", "IN_PROGRESS"]),
      ),
    );

  const touched = new Set(input.touchedPrescriptionIds ?? []);
  const pending = await tx
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.cycleId, input.cycleId),
        eq(recommendations.status, "PENDING"),
      ),
    );
  for (const item of pending) {
    const stored = item.candidates as
      | { changes?: Array<{ prescriptionId?: string }>; [key: string]: unknown }
      | null;
    const changes = Array.isArray(stored?.changes) ? stored.changes : [];
    const touchesTouched =
      touched.has(item.scopeId) ||
      changes.some(
        (change) =>
          change.prescriptionId &&
          touched.has(change.prescriptionId),
      );
    if (touchesTouched) {
      await tx
        .update(recommendations)
        .set({ status: "EXPIRED" })
        .where(eq(recommendations.id, item.id));
      continue;
    }
    const remappedChanges = changes.map((change) => ({
      ...change,
      prescriptionId: change.prescriptionId
        ? (input.prescriptionIdMap.get(change.prescriptionId) ??
          change.prescriptionId)
        : change.prescriptionId,
    }));
    await tx
      .update(recommendations)
      .set({
        candidates: { ...(stored ?? {}), changes: remappedChanges },
        scopeId:
          input.prescriptionIdMap.get(item.scopeId) ?? item.scopeId,
      })
      .where(eq(recommendations.id, item.id));
  }
}

export async function replacePrescriptionExercise(
  userId: string,
  prescriptionId: string,
  input: { variantId?: string; libraryId?: string },
  actorUserId?: string,
): Promise<ReplaceExerciseResult> {
  const db = getDb();
  const cycle = await getActiveCycle(userId);
  if (!cycle) {
    throw new PlanEditError("NO_ACTIVE_CYCLE", "Нет активного цикла", 409);
  }
  const currentVersionId = cycle.currentPlanVersionId;
  if (!currentVersionId) {
    throw new PlanEditError(
      "NO_PLAN_VERSION",
      "У цикла нет активной версии плана",
      409,
    );
  }

  const currentRows = await db
    .select({
      prescription: prescriptions,
      block: targetBlocks,
      variantSlug: exerciseVariants.slug,
      variantName: exerciseVariants.name,
      exerciseName: exercises.name,
    })
    .from(prescriptions)
    .innerJoin(targetBlocks, eq(prescriptions.targetBlockId, targetBlocks.id))
    .innerJoin(
      exerciseVariants,
      eq(prescriptions.exerciseVariantId, exerciseVariants.id),
    )
    .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
    .where(
      and(
        eq(prescriptions.id, prescriptionId),
        eq(prescriptions.planVersionId, currentVersionId),
      ),
    )
    .limit(1);
  const current = currentRows[0];
  if (!current) {
    throw new PlanEditError("NOT_FOUND", "Упражнение в плане не найдено", 404);
  }

  let selected:
    | {
        variant: typeof exerciseVariants.$inferSelect;
        exerciseName: string;
      }
    | undefined;
  let library: typeof exerciseLibrary.$inferSelect | undefined;

  if (input.libraryId) {
    const libraryRows = await db
      .select()
      .from(exerciseLibrary)
      .where(eq(exerciseLibrary.id, input.libraryId))
      .limit(1);
    library = libraryRows[0];
    if (!library) {
      throw new PlanEditError(
        "LIBRARY_EXERCISE_NOT_FOUND",
        "Упражнение не найдено в базе",
        404,
      );
    }
    if (
      current.prescription.role === "PRIMARY" &&
      (library.mechanic !== "compound" ||
        library.category === "stretching" ||
        library.category === "cardio")
    ) {
      throw new PlanEditError(
        "NOT_PRIMARY",
        "Для основного блока выберите базовое упражнение",
        422,
      );
    }
    selected = await ensureLibraryVariant(library, {
      userId,
      actorUserId,
    });
  } else if (input.variantId) {
    const selectedRows = await db
      .select({
        variant: exerciseVariants,
        exerciseName: exercises.name,
      })
      .from(exerciseVariants)
      .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
      .where(eq(exerciseVariants.id, input.variantId))
      .limit(1);
    selected = selectedRows[0];
    if (!selected) {
      throw new PlanEditError(
        "VARIANT_NOT_FOUND",
        "Упражнение не найдено в базе",
        404,
      );
    }

    const rule = exerciseBlockRule(selected.variant.slug);
    if (!rule || rule.blockKey !== current.block.key) {
      throw new PlanEditError(
        "INCOMPATIBLE_EXERCISE",
        "Это упражнение не подходит для данного блока",
        422,
      );
    }
    if (
      current.prescription.role === "PRIMARY" &&
      !rule.primaryEligible
    ) {
      throw new PlanEditError(
        "NOT_PRIMARY",
        "Для основного блока выберите базовое упражнение",
        422,
      );
    }
  }

  if (!selected) {
    throw new PlanEditError(
      "VARIANT_REQUIRED",
      "Выберите упражнение",
      422,
    );
  }
  if (selected.variant.id === current.prescription.exerciseVariantId) {
    throw new PlanEditError(
      "SAME_EXERCISE",
      "Это упражнение уже выбрано",
      409,
    );
  }

  const plannedRows = await db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(
      and(
        eq(sessions.cycleId, cycle.id),
        eq(sessions.sessionKey, current.prescription.sessionKey),
        inArray(sessions.status, ["PLANNED", "IN_PROGRESS"]),
      ),
    )
    .orderBy(asc(sessions.sessionIndex))
    .limit(1);
  if (!plannedRows[0]) {
    throw new PlanEditError(
      "NO_PLANNED_SESSION",
      "Для этого упражнения нет запланированной тренировки",
      409,
    );
  }
  if (plannedRows[0].status === "IN_PROGRESS") {
    const setRows = await db
      .select({ id: setPerformances.id })
      .from(setPerformances)
      .where(
        and(
          eq(setPerformances.sessionId, plannedRows[0].id),
          eq(setPerformances.prescriptionId, prescriptionId),
        ),
      )
      .limit(1);
    if (setRows.length > 0) {
      throw new PlanEditError(
        "EXERCISE_HAS_SETS",
        "По этому упражнению уже есть подходы; замена недоступна",
        409,
      );
    }
  }

  const before = snapshot({
    prescriptionId,
    exerciseVariantId: current.prescription.exerciseVariantId,
    variantSlug: current.variantSlug,
    exerciseName: current.exerciseName,
    variantName: current.variantName,
    role: current.prescription.role,
    sets: current.prescription.sets,
    targetReps: current.prescription.targetReps,
    loadMode: current.prescription.loadMode,
    weightKg: current.prescription.weightKg,
    assistanceKg: current.prescription.assistanceKg,
    addedKg: current.prescription.addedKg,
  });
  const after = snapshot({
    prescriptionId,
    exerciseVariantId: selected.variant.id,
    variantSlug: selected.variant.slug,
    exerciseName: selected.exerciseName,
    variantName: selected.variant.name,
    role: current.prescription.role,
    sets: current.prescription.sets,
    targetReps: current.prescription.targetReps,
    loadMode: selected.variant.loadMode,
    weightKg: null,
    assistanceKg: null,
    addedKg: null,
  });

  const recommendationId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();
  const newVersionId = crypto.randomUUID();
  const explanation = `Ручная замена: ${current.exerciseName} → ${selected.exerciseName} (${selected.variant.name}). Нагрузка обнулена для калибровки.`;
  let nextVersion = 0;

  await db.transaction(async (tx) => {
    const locked = await tx
      .select({
        id: trainingCycles.id,
        currentPlanVersionId: trainingCycles.currentPlanVersionId,
      })
      .from(trainingCycles)
      .where(eq(trainingCycles.id, cycle.id))
      .for("update")
      .limit(1);
    if (locked[0]?.currentPlanVersionId !== currentVersionId) {
      throw new PlanEditError(
        "PLAN_CHANGED",
        "План уже изменился. Обновите страницу.",
        409,
      );
    }

    const versionRows = await tx
      .select({ value: max(planVersions.version) })
      .from(planVersions)
      .where(eq(planVersions.cycleId, cycle.id));
    nextVersion = (versionRows[0]?.value ?? 0) + 1;

    await tx.insert(recommendations).values({
      id: recommendationId,
      cycleId: cycle.id,
      sessionId: null,
      action: "MANUAL_EXERCISE_SWAP",
      scopeType: "PRESCRIPTION",
      scopeId: prescriptionId,
      status: "ACCEPTED",
      explanation,
      candidates: {
        reasons: [explanation],
        ruleIds: ["MANUAL_EXERCISE_SWAP"],
        safety: {
          label: "GREEN",
          reasons: [],
          blockProgression: false,
          pause: false,
          escalate: false,
        },
        changes: [],
      },
      evidence: {
        source: "manual",
        fromVariantId: current.prescription.exerciseVariantId,
        toVariantId: selected.variant.id,
        toLibraryId: library?.id ?? null,
      },
      rulesVersion: "1.0.0",
      promptVersion: null,
      modelVersion: "manual",
      expiresAt: null,
    });

    await tx.insert(decisions).values({
      id: decisionId,
      recommendationId,
      userId,
      outcome: "EDITED",
      reasonCategory: "EXERCISE_SWAP",
      comment: null,
      before: { action: "EXERCISE_REPLACED", prescription: before },
      after: {
        action: "EXERCISE_REPLACED",
        prescription: after,
        planVersionId: newVersionId,
      },
    });

    await tx.insert(planVersions).values({
      id: newVersionId,
      cycleId: cycle.id,
      version: nextVersion,
      parentVersionId: currentVersionId,
      reason: `Замена упражнения: ${current.exerciseName} → ${selected.exerciseName}`,
      decisionId,
      rulesVersion: "1.0.0",
    });

    const oldBlocks = await tx
      .select()
      .from(targetBlocks)
      .where(eq(targetBlocks.planVersionId, currentVersionId));
    const blockIdMap = new Map<string, string>();
    for (const block of oldBlocks) {
      const id = crypto.randomUUID();
      blockIdMap.set(block.id, id);
      await tx.insert(targetBlocks).values({
        id,
        planVersionId: newVersionId,
        sessionKey: block.sessionKey,
        key: block.key,
        name: block.name,
        goal: block.goal,
        primaryPrescriptionId: null,
        progressionPolicy: block.progressionPolicy,
      });
    }

    const oldPrescriptions = await tx
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.planVersionId, currentVersionId));
    const prescriptionIdMap = new Map<string, string>();
    for (const item of oldPrescriptions) {
      const id = crypto.randomUUID();
      prescriptionIdMap.set(item.id, id);
      const targetBlockId = blockIdMap.get(item.targetBlockId);
      if (!targetBlockId) {
        throw new PlanEditError(
          "BROKEN_PLAN",
          "У назначения отсутствует целевой блок",
          500,
        );
      }
      await tx.insert(prescriptions).values({
        id,
        planVersionId: newVersionId,
        targetBlockId,
        exerciseVariantId: item.exerciseVariantId,
        role: item.role,
        supportsPrimaryId: null,
        sessionKey: item.sessionKey,
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
      });
    }

    for (const item of oldPrescriptions) {
      const newId = prescriptionIdMap.get(item.id);
      if (!newId) continue;
      if (item.supportsPrimaryId) {
        const supportsId = prescriptionIdMap.get(item.supportsPrimaryId);
        if (supportsId) {
          await tx
            .update(prescriptions)
            .set({ supportsPrimaryId: supportsId })
            .where(eq(prescriptions.id, newId));
        }
      }
    }

    for (const block of oldBlocks) {
      if (!block.primaryPrescriptionId) continue;
      const newBlockId = blockIdMap.get(block.id);
      const newPrimaryId = prescriptionIdMap.get(
        block.primaryPrescriptionId,
      );
      if (newBlockId && newPrimaryId) {
        await tx
          .update(targetBlocks)
          .set({ primaryPrescriptionId: newPrimaryId })
          .where(eq(targetBlocks.id, newBlockId));
      }
    }

    const newPrescriptionId = prescriptionIdMap.get(prescriptionId);
    if (!newPrescriptionId) {
      throw new PlanEditError(
        "BROKEN_PLAN",
        "Не удалось скопировать назначение",
        500,
      );
    }
    await tx
      .update(prescriptions)
      .set({
        exerciseVariantId: selected.variant.id,
        loadMode: selected.variant.loadMode,
        incrementKg: selected.variant.incrementKg,
        pair: selected.variant.pair,
        sides: selected.variant.sides,
        weightKg: null,
        assistanceKg: null,
        addedKg: null,
      })
      .where(eq(prescriptions.id, newPrescriptionId));

    await tx
      .update(trainingCycles)
      .set({ currentPlanVersionId: newVersionId })
      .where(eq(trainingCycles.id, cycle.id));

    const activeSessions = await tx
      .select({ id: sessions.id, status: sessions.status })
      .from(sessions)
      .where(
        and(
          eq(sessions.cycleId, cycle.id),
          inArray(sessions.status, ["PLANNED", "IN_PROGRESS"]),
        ),
      )
      .for("update");
    const inProgressIds = activeSessions
      .filter((session) => session.status === "IN_PROGRESS")
      .map((session) => session.id);
    if (inProgressIds.length > 0) {
      const replacedSets = await tx
        .select({ id: setPerformances.id })
        .from(setPerformances)
        .where(
          and(
            inArray(setPerformances.sessionId, inProgressIds),
            eq(setPerformances.prescriptionId, prescriptionId),
          ),
        )
        .limit(1);
      if (replacedSets.length > 0) {
        throw new PlanEditError(
          "EXERCISE_HAS_SETS",
          "По этому упражнению уже есть подходы; замена недоступна",
          409,
        );
      }
      const activeSets = await tx
        .select({
          id: setPerformances.id,
          prescriptionId: setPerformances.prescriptionId,
        })
        .from(setPerformances)
        .where(inArray(setPerformances.sessionId, inProgressIds))
        .for("update");
      for (const item of activeSets) {
        const mapped = prescriptionIdMap.get(item.prescriptionId);
        if (!mapped) {
          throw new PlanEditError(
            "BROKEN_PLAN",
            "Не удалось перенести подходы на новую версию плана",
            500,
          );
        }
        await tx
          .update(setPerformances)
          .set({ prescriptionId: mapped })
          .where(eq(setPerformances.id, item.id));
      }
    }

    const activeSessionIds = activeSessions.map((session) => session.id);
    const activeSkips = await tx
      .select({
        id: sessionPrescriptionSkips.id,
        prescriptionId: sessionPrescriptionSkips.prescriptionId,
      })
      .from(sessionPrescriptionSkips)
      .where(
        inArray(sessionPrescriptionSkips.sessionId, activeSessionIds),
      )
      .for("update");
    for (const item of activeSkips) {
      const mapped = prescriptionIdMap.get(item.prescriptionId);
      if (!mapped) {
        throw new PlanEditError(
          "BROKEN_PLAN",
          "Не удалось перенести пропуски упражнений",
          500,
        );
      }
      await tx
        .update(sessionPrescriptionSkips)
        .set({ prescriptionId: mapped })
        .where(eq(sessionPrescriptionSkips.id, item.id));
    }

    await tx
      .update(sessions)
      .set({ planVersionId: newVersionId })
      .where(
        and(
          eq(sessions.cycleId, cycle.id),
          inArray(sessions.status, ["PLANNED", "IN_PROGRESS"]),
        ),
      );

    const pending = await tx
      .select()
      .from(recommendations)
      .where(
        and(
          eq(recommendations.cycleId, cycle.id),
          eq(recommendations.status, "PENDING"),
        ),
      );
    for (const item of pending) {
      const stored = item.candidates as
        | { changes?: Array<{ prescriptionId?: string }>; [key: string]: unknown }
        | null;
      const changes = Array.isArray(stored?.changes) ? stored.changes : [];
      const touchesReplaced =
        item.scopeId === prescriptionId ||
        changes.some((change) => change.prescriptionId === prescriptionId);
      if (touchesReplaced) {
        await tx
          .update(recommendations)
          .set({ status: "EXPIRED" })
          .where(eq(recommendations.id, item.id));
        continue;
      }
      const remappedChanges = changes.map((change) => ({
        ...change,
        prescriptionId: change.prescriptionId
          ? (prescriptionIdMap.get(change.prescriptionId) ??
            change.prescriptionId)
          : change.prescriptionId,
      }));
      await tx
        .update(recommendations)
        .set({
          candidates: { ...(stored ?? {}), changes: remappedChanges },
          scopeId: prescriptionIdMap.get(item.scopeId) ?? item.scopeId,
        })
        .where(eq(recommendations.id, item.id));
    }

    await tx.insert(auditEvents).values({
      userId,
      actorUserId: actorUserId ?? userId,
      entity: "plan_version",
      entityId: newVersionId,
      eventType: "PLAN_VERSION_CREATED",
      payload: {
        action: "EXERCISE_REPLACED",
        prescriptionId,
        from: before,
        to: after,
        decisionId,
        recommendationId,
      },
      versions: { rules: "1.0.0", plan: nextVersion },
    });
  });

  return {
    planVersionId: newVersionId,
    version: nextVersion,
    prescriptionId,
    from: before,
    to: after,
  };
}
