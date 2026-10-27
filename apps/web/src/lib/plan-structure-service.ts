import { and, eq, inArray, max } from "drizzle-orm";
import {
  auditEvents,
  decisions,
  exerciseLibrary,
  exercises,
  exerciseVariants,
  getDb,
  planVersions,
  prescriptions,
  recommendations,
  sessions,
  setPerformances,
  targetBlocks,
  trainingCycles,
} from "@chiron/db";
import {
  activatePlanVersion,
  copyPlanVersion,
  ensureLibraryVariant,
  PlanEditError,
} from "./plan-edit-service";
import { getActiveCycle } from "./plan-service";

export interface PlanStructureResult {
  planVersionId: string;
  version: number;
  prescriptionId: string;
}

interface SessionContext {
  session: typeof sessions.$inferSelect;
  currentVersionId: string;
  cycleId: string;
}

async function loadSessionContext(
  userId: string,
  sessionId: string,
  db: ReturnType<typeof getDb>,
): Promise<SessionContext> {
  const cycle = await getActiveCycle(userId);
  if (!cycle) {
    throw new PlanEditError("NO_ACTIVE_CYCLE", "Нет активного цикла", 409);
  }
  if (!cycle.currentPlanVersionId) {
    throw new PlanEditError(
      "NO_PLAN_VERSION",
      "У цикла нет активной версии плана",
      409,
    );
  }
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.cycleId, cycle.id)),
    )
    .limit(1);
  const session = rows[0];
  if (!session) {
    throw new PlanEditError("SESSION_NOT_FOUND", "Тренировка не найдена", 404);
  }
  if (session.status === "COMPLETED" || session.status === "SKIPPED") {
    throw new PlanEditError(
      "SESSION_CLOSED",
      "Нельзя менять схему завершённой или пропущенной тренировки",
      409,
    );
  }
  return {
    session,
    cycleId: cycle.id,
    currentVersionId: cycle.currentPlanVersionId,
  };
}

async function nextVersion(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  cycleId: string,
): Promise<number> {
  const rows = await tx
    .select({ value: max(planVersions.version) })
    .from(planVersions)
    .where(eq(planVersions.cycleId, cycleId));
  return (rows[0]?.value ?? 0) + 1;
}

export async function addLibraryExercise(
  userId: string,
  sessionId: string,
  input: { libraryId: string; blockKey: string },
  actorUserId?: string,
): Promise<PlanStructureResult> {
  const db = getDb();
  const context = await loadSessionContext(userId, sessionId, db);
  const libraryRows = await db
    .select()
    .from(exerciseLibrary)
    .where(eq(exerciseLibrary.id, input.libraryId))
    .limit(1);
  const library = libraryRows[0];
  if (!library) {
    throw new PlanEditError(
      "LIBRARY_EXERCISE_NOT_FOUND",
      "Упражнение не найдено в базе",
      404,
    );
  }
  const blockRows = await db
    .select()
    .from(targetBlocks)
    .where(
      and(
        eq(targetBlocks.planVersionId, context.currentVersionId),
        eq(targetBlocks.sessionKey, context.session.sessionKey),
        eq(targetBlocks.key, input.blockKey),
      ),
    )
    .limit(1);
  const block = blockRows[0];
  if (!block) {
    throw new PlanEditError("BLOCK_NOT_FOUND", "Целевой блок не найден", 404);
  }

  const selected = await ensureLibraryVariant(library, {
    userId,
    actorUserId,
  });
  const existing = await db
    .select({ id: prescriptions.id })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.planVersionId, context.currentVersionId),
        eq(prescriptions.sessionKey, context.session.sessionKey),
        eq(prescriptions.exerciseVariantId, selected.variant.id),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    throw new PlanEditError(
      "EXERCISE_ALREADY_IN_PLAN",
      "Это упражнение уже есть в этом дне",
      409,
    );
  }

  const orderRows = await db
    .select({ value: max(prescriptions.plannedOrder) })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.planVersionId, context.currentVersionId),
        eq(prescriptions.sessionKey, context.session.sessionKey),
        eq(prescriptions.targetBlockId, block.id),
      ),
    );
  const plannedOrder = (orderRows[0]?.value ?? 0) + 1;

  const recommendationId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();
  const newVersionId = crypto.randomUUID();
  const newPrescriptionId = crypto.randomUUID();
  let version = 0;

  await db.transaction(async (tx) => {
    const locked = await tx
      .select({ currentPlanVersionId: trainingCycles.currentPlanVersionId })
      .from(trainingCycles)
      .where(eq(trainingCycles.id, context.cycleId))
      .for("update")
      .limit(1);
    if (locked[0]?.currentPlanVersionId !== context.currentVersionId) {
      throw new PlanEditError(
        "PLAN_CHANGED",
        "План уже изменился. Обновите страницу.",
        409,
      );
    }
    version = await nextVersion(tx, context.cycleId);

    await tx.insert(recommendations).values({
      id: recommendationId,
      cycleId: context.cycleId,
      sessionId: null,
      action: "MANUAL_EXERCISE_ADD",
      scopeType: "PRESCRIPTION",
      scopeId: newPrescriptionId,
      status: "ACCEPTED",
      explanation: `Ручное добавление: ${selected.exerciseName} (${selected.variant.name}) в блок «${block.name}».`,
      candidates: {
        reasons: [
          "Упражнение добавлено вручную из базы.",
          "Нагрузка обнулена для калибровки.",
        ],
        ruleIds: ["MANUAL_EXERCISE_ADD"],
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
        libraryId: library.id,
        toVariantId: selected.variant.id,
        blockKey: block.key,
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
      reasonCategory: "EXERCISE_ADDED",
      comment: null,
      before: {
        action: "EXERCISE_ADDED",
        sessionKey: context.session.sessionKey,
        blockKey: block.key,
      },
      after: {
        action: "EXERCISE_ADDED",
        prescriptionId: newPrescriptionId,
        planVersionId: newVersionId,
      },
    });

    const { blockIdMap, prescriptionIdMap } = await copyPlanVersion(tx, {
      cycleId: context.cycleId,
      currentVersionId: context.currentVersionId,
      newVersionId,
      nextVersion: version,
      reason: `Добавление упражнения: ${selected.exerciseName} в блок «${block.name}»`,
      decisionId,
    });
    const newBlockId = blockIdMap.get(block.id);
    if (!newBlockId) {
      throw new PlanEditError(
        "BROKEN_PLAN",
        "Не удалось найти блок в новой версии плана",
        500,
      );
    }

    await tx.insert(prescriptions).values({
      id: newPrescriptionId,
      planVersionId: newVersionId,
      targetBlockId: newBlockId,
      exerciseVariantId: selected.variant.id,
      role: "ACCESSORY",
      supportsPrimaryId: null,
      sessionKey: context.session.sessionKey,
      plannedOrder,
      optional: true,
      sets: 2,
      repMin: 8,
      repMax: 12,
      targetReps: 10,
      targetRir: 2,
      loadMode: selected.variant.loadMode,
      weightKg: null,
      assistanceKg: null,
      addedKg: null,
      incrementKg: selected.variant.incrementKg,
      pair: selected.variant.pair,
      sides: selected.variant.sides,
    });

    await activatePlanVersion(tx, {
      cycleId: context.cycleId,
      newVersionId,
      prescriptionIdMap,
    });

    await tx.insert(auditEvents).values({
      userId,
      actorUserId: actorUserId ?? userId,
      entity: "plan_version",
      entityId: newVersionId,
      eventType: "PLAN_VERSION_CREATED",
      payload: {
        action: "EXERCISE_ADDED",
        prescriptionId: newPrescriptionId,
        libraryId: library.id,
        variantId: selected.variant.id,
        blockKey: block.key,
        decisionId,
        recommendationId,
      },
      versions: { rules: "1.0.0", plan: version },
    });
  });

  return {
    planVersionId: newVersionId,
    version,
    prescriptionId: newPrescriptionId,
  };
}

export async function removePrescriptionFromPlan(
  userId: string,
  sessionId: string,
  prescriptionId: string,
  actorUserId?: string,
): Promise<PlanStructureResult> {
  const db = getDb();
  const context = await loadSessionContext(userId, sessionId, db);
  const rows = await db
    .select({
      prescription: prescriptions,
      block: targetBlocks,
      exerciseName: exercises.name,
      variantName: exerciseVariants.name,
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
        eq(prescriptions.planVersionId, context.currentVersionId),
      ),
    )
    .limit(1);
  const current = rows[0];
  if (!current) {
    throw new PlanEditError("NOT_FOUND", "Упражнение в плане не найдено", 404);
  }
  if (
    current.prescription.role === "PRIMARY" ||
    current.block.primaryPrescriptionId === prescriptionId
  ) {
    throw new PlanEditError(
      "PRIMARY_EXERCISE",
      "Основное упражнение можно только заменить",
      409,
    );
  }

  const active = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.cycleId, context.cycleId),
        eq(sessions.status, "IN_PROGRESS"),
      ),
    );
  if (active.length > 0) {
    const activeSets = await db
      .select({ id: setPerformances.id })
      .from(setPerformances)
      .where(
        and(
          inArray(
            setPerformances.sessionId,
            active.map((session) => session.id),
          ),
          eq(setPerformances.prescriptionId, prescriptionId),
        ),
      )
      .limit(1);
    if (activeSets.length > 0) {
      throw new PlanEditError(
        "EXERCISE_HAS_SETS",
        "По упражнению уже есть подходы; удаление недоступно",
        409,
      );
    }
  }

  const recommendationId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();
  const newVersionId = crypto.randomUUID();
  let version = 0;

  await db.transaction(async (tx) => {
    const locked = await tx
      .select({ currentPlanVersionId: trainingCycles.currentPlanVersionId })
      .from(trainingCycles)
      .where(eq(trainingCycles.id, context.cycleId))
      .for("update")
      .limit(1);
    if (locked[0]?.currentPlanVersionId !== context.currentVersionId) {
      throw new PlanEditError(
        "PLAN_CHANGED",
        "План уже изменился. Обновите страницу.",
        409,
      );
    }
    version = await nextVersion(tx, context.cycleId);

    await tx.insert(recommendations).values({
      id: recommendationId,
      cycleId: context.cycleId,
      sessionId: null,
      action: "MANUAL_EXERCISE_REMOVE",
      scopeType: "PRESCRIPTION",
      scopeId: prescriptionId,
      status: "ACCEPTED",
      explanation: `Ручное удаление: ${current.exerciseName} (${current.variantName}) из блока «${current.block.name}».`,
      candidates: {
        reasons: ["Упражнение удалено вручную из схемы."],
        ruleIds: ["MANUAL_EXERCISE_REMOVE"],
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
        blockKey: current.block.key,
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
      reasonCategory: "EXERCISE_REMOVED",
      comment: null,
      before: {
        action: "EXERCISE_REMOVED",
        prescriptionId,
        exerciseName: current.exerciseName,
        variantName: current.variantName,
      },
      after: {
        action: "EXERCISE_REMOVED",
        planVersionId: newVersionId,
      },
    });

    const { prescriptionIdMap } = await copyPlanVersion(tx, {
      cycleId: context.cycleId,
      currentVersionId: context.currentVersionId,
      newVersionId,
      nextVersion: version,
      reason: `Удаление упражнения: ${current.exerciseName} из блока «${current.block.name}»`,
      decisionId,
    });
    const newRemovedId = prescriptionIdMap.get(prescriptionId);
    if (!newRemovedId) {
      throw new PlanEditError(
        "BROKEN_PLAN",
        "Не удалось скопировать назначение",
        500,
      );
    }
    await tx.delete(prescriptions).where(eq(prescriptions.id, newRemovedId));
    prescriptionIdMap.delete(prescriptionId);
    await tx
      .update(prescriptions)
      .set({ supportsPrimaryId: null })
      .where(
        and(
          eq(prescriptions.planVersionId, newVersionId),
          eq(prescriptions.supportsPrimaryId, newRemovedId),
        ),
      );

    await activatePlanVersion(tx, {
      cycleId: context.cycleId,
      newVersionId,
      prescriptionIdMap,
      touchedPrescriptionIds: [prescriptionId],
      removedPrescriptionId: prescriptionId,
    });

    await tx.insert(auditEvents).values({
      userId,
      actorUserId: actorUserId ?? userId,
      entity: "plan_version",
      entityId: newVersionId,
      eventType: "PLAN_VERSION_CREATED",
      payload: {
        action: "EXERCISE_REMOVED",
        prescriptionId,
        exerciseName: current.exerciseName,
        variantName: current.variantName,
        blockKey: current.block.key,
        decisionId,
        recommendationId,
      },
      versions: { rules: "1.0.0", plan: version },
    });
  });

  return {
    planVersionId: newVersionId,
    version,
    prescriptionId,
  };
}
