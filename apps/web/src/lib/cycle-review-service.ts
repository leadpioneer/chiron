import { and, asc, desc, eq } from "drizzle-orm";
import type {
  CycleReviewAction,
  CycleReviewReason,
  TrainingScheme,
} from "@chiron/contracts";
import {
  applyCycleMultiplier,
  cycleEndDate,
  generateSessionSchedule,
  rebuildMultiplierForDays,
  RETURN_PHASE_SESSIONS,
  type PauseState,
} from "@chiron/core";
import {
  athleteProfiles,
  auditEvents,
  decisions,
  getDb,
  planVersions,
  prescriptions,
  recommendations,
  sessions,
  targetBlocks,
  trainingCycles,
} from "@chiron/db";
import { getPauseStateForUser } from "./return-service";
import { todayIso } from "./dates";

export class CycleReviewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CycleReviewError";
  }
}

export interface CycleReviewState {
  required: boolean;
  phase: PauseState["phase"];
  pauseDays: number;
  lastTrainingDate: string | null;
  reason: CycleReviewReason;
  safety: boolean;
}

export interface CycleReviewResult {
  action: CycleReviewAction;
  oldCycleId: string;
  newCycleId: string | null;
}

export function toCycleReviewState(pause: PauseState): CycleReviewState {
  const safety = pause.phase === "SAFETY" || pause.reason === "SAFETY";
  return {
    required: pause.phase === "LONG" || pause.phase === "SAFETY",
    phase: pause.phase,
    pauseDays: pause.days,
    lastTrainingDate: pause.lastExposureDate,
    reason: safety ? "ILLNESS" : "LONG_PAUSE",
    safety,
  };
}

export async function getCycleReviewState(
  userId: string,
  cycle: { id: string; userId: string; startDate: string },
  options: { today?: string } = {},
): Promise<CycleReviewState> {
  const pause = await getPauseStateForUser(userId, cycle, options);
  return toCycleReviewState(pause);
}

export async function reviewCycle(
  userId: string,
  cycleId: string,
  input: { action: CycleReviewAction; reason: CycleReviewReason },
  options: { today?: string; actorUserId?: string } = {},
): Promise<CycleReviewResult> {
  const db = getDb();
  const today = options.today ?? todayIso();

  const cycleRows = await db
    .select()
    .from(trainingCycles)
    .where(
      and(eq(trainingCycles.id, cycleId), eq(trainingCycles.userId, userId)),
    )
    .limit(1);
  const cycle = cycleRows[0];
  if (!cycle) {
    throw new CycleReviewError("NOT_FOUND", "Цикл не найден", 404);
  }

  const pause = await getPauseStateForUser(userId, cycle, { today });

  return db.transaction(async (tx) => {
    const lockedRows = await tx
      .select()
      .from(trainingCycles)
      .where(eq(trainingCycles.id, cycleId))
      .for("update");
    const locked = lockedRows[0];
    if (!locked) {
      throw new CycleReviewError("NOT_FOUND", "Цикл не найден", 404);
    }
    if (locked.status !== "ACTIVE") {
      throw new CycleReviewError(
        "CYCLE_NOT_ACTIVE",
        "Цикл уже закрыт или пересмотрен",
        409,
      );
    }

    await tx
      .update(trainingCycles)
      .set({
        status: "STOPPED",
        closeReason: input.reason,
        completedAt: new Date(),
      })
      .where(eq(trainingCycles.id, locked.id));

    await tx
      .update(recommendations)
      .set({ status: "EXPIRED" })
      .where(
        and(
          eq(recommendations.cycleId, locked.id),
          eq(recommendations.status, "PENDING"),
        ),
      );

    if (input.action === "STOP") {
      await tx.insert(auditEvents).values({
        userId,
        actorUserId: options.actorUserId ?? userId,
        entity: "training_cycle",
        entityId: locked.id,
        eventType: "CYCLE_REVIEWED",
        payload: {
          action: "STOP",
          reason: input.reason,
          pauseDays: pause.days,
          phase: pause.phase,
        },
        versions: { rules: "1.0.0" },
      });
      return { action: "STOP" as const, oldCycleId: locked.id, newCycleId: null };
    }

    let sourceVersionId = locked.currentPlanVersionId;
    if (!sourceVersionId) {
      const latestVersionRows = await tx
        .select()
        .from(planVersions)
        .where(eq(planVersions.cycleId, locked.id))
        .orderBy(desc(planVersions.version))
        .limit(1);
      sourceVersionId = latestVersionRows[0]?.id ?? null;
    }
    if (!sourceVersionId) {
      throw new CycleReviewError(
        "BROKEN_PLAN",
        "В цикле нет версии плана для пересборки",
        500,
      );
    }

    const oldBlocks = await tx
      .select()
      .from(targetBlocks)
      .where(eq(targetBlocks.planVersionId, sourceVersionId))
      .orderBy(asc(targetBlocks.sessionKey), asc(targetBlocks.key));
    const oldPrescriptions = await tx
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.planVersionId, sourceVersionId))
      .orderBy(asc(prescriptions.sessionKey), asc(prescriptions.plannedOrder));

    if (oldPrescriptions.length === 0) {
      throw new CycleReviewError(
        "BROKEN_PLAN",
        "В исходной версии нет назначений",
        500,
      );
    }

    const multiplier = rebuildMultiplierForDays(pause.days);
    const profileRows = await tx
      .select({ trainingScheme: athleteProfiles.trainingScheme })
      .from(athleteProfiles)
      .where(eq(athleteProfiles.userId, userId))
      .limit(1);
    const scheme = (profileRows[0]?.trainingScheme ??
      "EVERY_OTHER_DAY") as TrainingScheme;

    const newCycleRows = await tx
      .insert(trainingCycles)
      .values({
        userId,
        templateId: locked.templateId,
        startDate: today,
        endDate: cycleEndDate(today, 8),
        status: "ACTIVE",
        returnPhaseSessions: RETURN_PHASE_SESSIONS,
      })
      .returning();
    const newCycle = newCycleRows[0];
    if (!newCycle) {
      throw new CycleReviewError("CREATE_FAILED", "Не удалось создать цикл", 500);
    }

    const newVersionId = crypto.randomUUID();
    const decisionId = crypto.randomUUID();
    const recommendationId = crypto.randomUUID();

    await tx.insert(planVersions).values({
      id: newVersionId,
      cycleId: newCycle.id,
      version: 1,
      parentVersionId: null,
      reason: "Пересборка после паузы",
      decisionId,
      rulesVersion: "1.0.0",
    });

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

    const prescriptionIdMap = new Map<string, string>();
    for (const item of oldPrescriptions) {
      const id = crypto.randomUUID();
      prescriptionIdMap.set(item.id, id);
      const targetBlockId = blockIdMap.get(item.targetBlockId);
      if (!targetBlockId) {
        throw new CycleReviewError(
          "BROKEN_PLAN",
          "У назначения отсутствует целевой блок",
          500,
        );
      }
      const load = applyCycleMultiplier(
        {
          loadMode: item.loadMode as Parameters<
            typeof applyCycleMultiplier
          >[0]["loadMode"],
          weightKg: item.weightKg,
          assistanceKg: item.assistanceKg,
          addedKg: item.addedKg,
          incrementKg: item.incrementKg,
        },
        multiplier,
      );
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
        weightKg: load.weightKg,
        assistanceKg: load.assistanceKg,
        addedKg: load.addedKg,
        incrementKg: item.incrementKg,
        pair: item.pair,
        sides: item.sides,
      });
    }

    for (const item of oldPrescriptions) {
      const newId = prescriptionIdMap.get(item.id);
      if (!newId || !item.supportsPrimaryId) continue;
      const supportsId = prescriptionIdMap.get(item.supportsPrimaryId);
      if (supportsId) {
        await tx
          .update(prescriptions)
          .set({ supportsPrimaryId: supportsId })
          .where(eq(prescriptions.id, newId));
      }
    }

    for (const block of oldBlocks) {
      if (!block.primaryPrescriptionId) continue;
      const newBlockId = blockIdMap.get(block.id);
      const newPrimaryId = prescriptionIdMap.get(block.primaryPrescriptionId);
      if (newBlockId && newPrimaryId) {
        await tx
          .update(targetBlocks)
          .set({ primaryPrescriptionId: newPrimaryId })
          .where(eq(targetBlocks.id, newBlockId));
      }
    }

    await tx
      .update(trainingCycles)
      .set({ currentPlanVersionId: newVersionId })
      .where(eq(trainingCycles.id, newCycle.id));

    const schedule = generateSessionSchedule(today, scheme, 8);
    for (const item of schedule) {
      await tx.insert(sessions).values({
        cycleId: newCycle.id,
        planVersionId: newVersionId,
        sessionIndex: item.sessionIndex,
        sessionKey: item.sessionKey,
        plannedDate: item.plannedDate,
        status: "PLANNED",
        isReturn: item.sessionIndex < RETURN_PHASE_SESSIONS,
      });
    }

    await tx.insert(recommendations).values({
      id: recommendationId,
      cycleId: newCycle.id,
      sessionId: null,
      action: "REBUILD",
      scopeType: "CYCLE",
      scopeId: newCycle.id,
      status: "ACCEPTED",
      explanation:
        "Цикл пересобран после паузы. Нагрузки снижены, первые четыре сессии — возвратные.",
      candidates: {
        reasons: [
          `Пауза ${pause.days} дн.`,
          `Множитель нагрузки ${multiplier === null ? "калибровка" : `${Math.round(multiplier * 100)}%`}.`,
          "Первые четыре сессии — возвратные, прогрессия заблокирована.",
        ],
        ruleIds: ["CYCLE_REVIEW_REBUILD"],
        safety: {
          label: "GREEN",
          reasons: [],
          blockProgression: true,
          pause: false,
          escalate: false,
        },
        changes: [],
      },
      evidence: {
        sourceCycleId: locked.id,
        sourceVersionId,
        pauseDays: pause.days,
        phase: pause.phase,
        multiplier,
        returnPhaseSessions: RETURN_PHASE_SESSIONS,
        sessions: schedule.length,
      },
      rulesVersion: "1.0.0",
      promptVersion: "rules-only",
      modelVersion: "deterministic",
      expiresAt: null,
    });

    await tx.insert(decisions).values({
      id: decisionId,
      recommendationId,
      userId,
      outcome: "ACCEPTED",
      reasonCategory: null,
      comment: null,
      before: {
        cycleId: locked.id,
        planVersionId: sourceVersionId,
        status: "ACTIVE",
      },
      after: {
        cycleId: newCycle.id,
        planVersionId: newVersionId,
        multiplier,
        returnPhaseSessions: RETURN_PHASE_SESSIONS,
        sessions: schedule.length,
      },
    });

    await tx.insert(auditEvents).values({
      userId,
      actorUserId: options.actorUserId ?? userId,
      entity: "training_cycle",
      entityId: locked.id,
      eventType: "CYCLE_REVIEWED",
      payload: {
        action: "REBUILD",
        reason: input.reason,
        pauseDays: pause.days,
        phase: pause.phase,
        newCycleId: newCycle.id,
      },
      versions: { rules: "1.0.0" },
    });
    await tx.insert(auditEvents).values({
      userId,
      actorUserId: options.actorUserId ?? userId,
      entity: "training_cycle",
      entityId: newCycle.id,
      eventType: "CYCLE_REBUILT",
      payload: {
        sourceCycleId: locked.id,
        sourceVersionId,
        multiplier,
        returnPhaseSessions: RETURN_PHASE_SESSIONS,
        sessions: schedule.length,
        startDate: today,
        endDate: cycleEndDate(today, 8),
      },
      versions: { rules: "1.0.0", plan: 1 },
    });

    return {
      action: "REBUILD" as const,
      oldCycleId: locked.id,
      newCycleId: newCycle.id,
    };
  });
}
