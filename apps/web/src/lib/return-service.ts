import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  max,
} from "drizzle-orm";
import type { LoadMode } from "@chiron/contracts";
import {
  applyReturnLoad,
  buildPauseState,
  type PauseState,
  type ReturnLoad,
} from "@chiron/core";
import {
  auditEvents,
  decisions,
  exerciseVariants,
  exercises,
  getDb,
  planVersions,
  prescriptions,
  recommendations,
  safetyEvents,
  sessions,
  targetBlocks,
  trainingCycles,
  wellnessChecks,
} from "@chiron/db";
import { todayIso } from "./dates";

export class ReturnError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ReturnError";
  }
}

export interface ReturnPreviewItem {
  prescriptionId: string;
  exerciseName: string;
  variantName: string;
  role: string;
  loadMode: LoadMode;
  before: ReturnLoad;
  after: ReturnLoad;
  beforeTargetRir: number;
  afterTargetRir: number;
}

export interface ReturnPreview {
  sessionId: string;
  phase: "RETURN_1" | "RETURN_2";
  days: number;
  sessions: number;
  targetRirs: number[];
  items: ReturnPreviewItem[];
}

interface CycleLike {
  id: string;
  userId: string;
  startDate: string;
}

function isoDateOf(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return todayIso(value);
}

async function getLastExposureDate(
  userId: string,
  cycleId: string,
): Promise<string | null> {
  const rows = await getDb()
    .select({
      actualDate: sessions.actualDate,
      plannedDate: sessions.plannedDate,
    })
    .from(sessions)
    .innerJoin(trainingCycles, eq(sessions.cycleId, trainingCycles.id))
    .where(
      and(
        eq(trainingCycles.userId, userId),
        eq(sessions.cycleId, cycleId),
        eq(sessions.status, "COMPLETED"),
        isNotNull(sessions.actualDate),
      ),
    )
    .orderBy(desc(sessions.actualDate), desc(sessions.sessionIndex))
    .limit(1);
  const row = rows[0];
  return row?.actualDate ?? row?.plannedDate ?? null;
}

async function findActiveSafetyPause(
  userId: string,
  lastExposureDate: string | null,
): Promise<string | null> {
  const db = getDb();
  const [redRows, pauseRows, illnessRows] = await Promise.all([
    db
      .select({ createdAt: safetyEvents.createdAt })
      .from(safetyEvents)
      .where(
        and(eq(safetyEvents.userId, userId), eq(safetyEvents.severity, "RED")),
      )
      .orderBy(desc(safetyEvents.createdAt))
      .limit(1),
    db
      .select({ createdAt: recommendations.createdAt })
      .from(recommendations)
      .innerJoin(trainingCycles, eq(recommendations.cycleId, trainingCycles.id))
      .where(
        and(
          eq(trainingCycles.userId, userId),
          eq(recommendations.action, "PAUSE"),
          eq(recommendations.status, "ACCEPTED"),
        ),
      )
      .orderBy(desc(recommendations.createdAt))
      .limit(1),
    db
      .select({ recordedAt: wellnessChecks.recordedAt })
      .from(wellnessChecks)
      .where(
        and(
          eq(wellnessChecks.userId, userId),
          inArray(wellnessChecks.illness, ["SIGNS", "CONFIRMED"]),
        ),
      )
      .orderBy(desc(wellnessChecks.recordedAt), desc(wellnessChecks.createdAt))
      .limit(1),
  ]);

  const candidates = [
    redRows[0] ? isoDateOf(redRows[0].createdAt) : null,
    pauseRows[0] ? isoDateOf(pauseRows[0].createdAt) : null,
    illnessRows[0] ? isoDateOf(illnessRows[0].recordedAt) : null,
  ].filter((value): value is string => value !== null);

  const active = candidates.filter(
    (date) => lastExposureDate === null || date >= lastExposureDate,
  );
  if (active.length === 0) return null;
  return active.sort()[0] ?? null;
}

export async function getPauseStateForUser(
  userId: string,
  cycle: CycleLike,
  options: { today?: string } = {},
): Promise<PauseState> {
  const today = options.today ?? todayIso();
  const lastExposureDate = await getLastExposureDate(userId, cycle.id);
  const safetyPausedAt = await findActiveSafetyPause(userId, lastExposureDate);
  return buildPauseState({
    lastExposureDate,
    cycleStartDate: cycle.startDate,
    today,
    safetyPausedAt,
  });
}

function toLoad(input: {
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
}): ReturnLoad {
  return {
    weightKg: input.weightKg,
    assistanceKg: input.assistanceKg,
    addedKg: input.addedKg,
  };
}

async function loadSessionPrescriptions(
  sessionId: string,
): Promise<
  Array<{
    prescriptionId: string;
    exerciseName: string;
    variantName: string;
    role: string;
    loadMode: LoadMode;
    weightKg: number | null;
    assistanceKg: number | null;
    addedKg: number | null;
    incrementKg: number;
    targetRir: number;
  }>
> {
  const db = getDb();
  const sessionRows = await db
    .select({ planVersionId: sessions.planVersionId, sessionKey: sessions.sessionKey })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = sessionRows[0];
  if (!session) return [];

  const rows = await db
    .select({
      prescription: prescriptions,
      exerciseName: exercises.name,
      variantName: exerciseVariants.name,
    })
    .from(prescriptions)
    .innerJoin(
      exerciseVariants,
      eq(prescriptions.exerciseVariantId, exerciseVariants.id),
    )
    .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
    .where(
      and(
        eq(prescriptions.planVersionId, session.planVersionId),
        eq(prescriptions.sessionKey, session.sessionKey),
      ),
    )
    .orderBy(asc(prescriptions.plannedOrder));

  return rows.map((row) => ({
    prescriptionId: row.prescription.id,
    exerciseName: row.exerciseName,
    variantName: row.variantName,
    role: row.prescription.role,
    loadMode: row.prescription.loadMode as LoadMode,
    weightKg: row.prescription.weightKg,
    assistanceKg: row.prescription.assistanceKg,
    addedKg: row.prescription.addedKg,
    incrementKg: row.prescription.incrementKg,
    targetRir: row.prescription.targetRir,
  }));
}

export async function getReturnPreview(
  userId: string,
  sessionId: string,
  options: { today?: string } = {},
): Promise<ReturnPreview | null> {
  const db = getDb();
  const rows = await db
    .select({ session: sessions, cycle: trainingCycles })
    .from(sessions)
    .innerJoin(trainingCycles, eq(sessions.cycleId, trainingCycles.id))
    .where(
      and(eq(sessions.id, sessionId), eq(trainingCycles.userId, userId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row || row.session.status !== "PLANNED") return null;

  const pause = await getPauseStateForUser(userId, row.cycle, options);
  if (pause.phase !== "RETURN_1" && pause.phase !== "RETURN_2") return null;
  if (pause.returnPercent === null) return null;

  const items = await loadSessionPrescriptions(sessionId);
  const targetRir = pause.targetRirs[0] ?? 3;
  return {
    sessionId,
    phase: pause.phase,
    days: pause.days,
    sessions: pause.returnSessions,
    targetRirs: pause.targetRirs,
    items: items.map((item) => {
      const after = applyReturnLoad({
        loadMode: item.loadMode,
        weightKg: item.weightKg,
        assistanceKg: item.assistanceKg,
        addedKg: item.addedKg,
        incrementKg: item.incrementKg,
        percent: pause.returnPercent ?? 0,
      });
      return {
        prescriptionId: item.prescriptionId,
        exerciseName: item.exerciseName,
        variantName: item.variantName,
        role: item.role,
        loadMode: item.loadMode,
        before: toLoad(item),
        after,
        beforeTargetRir: item.targetRir,
        afterTargetRir: targetRir,
      };
    }),
  };
}

export interface ReturnResult {
  sessionId: string;
  phase: "RETURN_1" | "RETURN_2";
  planVersionId: string;
  recommendationId: string;
  sessions: string[];
  changes: Array<{
    prescriptionId: string;
    exerciseName: string;
    before: ReturnLoad;
    after: ReturnLoad;
    targetRir: number;
  }>;
}

export async function prepareReturn(
  userId: string,
  sessionId: string,
  options: { today?: string } = {},
): Promise<ReturnResult> {
  const db = getDb();
  const today = options.today ?? todayIso();

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ session: sessions, cycle: trainingCycles })
      .from(sessions)
      .innerJoin(trainingCycles, eq(sessions.cycleId, trainingCycles.id))
      .where(
        and(eq(sessions.id, sessionId), eq(trainingCycles.userId, userId)),
      )
      .for("update");

    const row = rows[0];
    if (!row) {
      throw new ReturnError("NOT_FOUND", "Тренировка не найдена", 404);
    }
    if (row.cycle.status !== "ACTIVE") {
      throw new ReturnError("CYCLE_CLOSED", "Цикл закрыт", 409);
    }
    if (row.session.status !== "PLANNED") {
      throw new ReturnError(
        "NOT_PLANNED",
        "Возвращение готовится только для запланированной тренировки",
        409,
      );
    }
    if (row.session.isReturn) {
      throw new ReturnError(
        "ALREADY_RETURN",
        "Возвращение уже подготовлено для этой тренировки",
        409,
      );
    }

    const plannedReturns = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.cycleId, row.cycle.id),
          eq(sessions.isReturn, true),
          eq(sessions.status, "PLANNED"),
        ),
      )
      .limit(1);
    if (plannedReturns.length > 0) {
      throw new ReturnError(
        "ALREADY_RETURN",
        "Возвращение уже подготовлено. Завершите возвратные сессии.",
        409,
      );
    }

    const lastExposureDate = await getLastExposureDate(userId, row.cycle.id);
    const safetyPausedAt = await findActiveSafetyPause(
      userId,
      lastExposureDate,
    );
    const pause = buildPauseState({
      lastExposureDate,
      cycleStartDate: row.cycle.startDate,
      today,
      safetyPausedAt,
    });

    if (pause.phase === "LONG") {
      throw new ReturnError(
        "REVIEW_REQUIRED",
        "После паузы нужен пересмотр цикла",
        409,
      );
    }
    if (pause.phase === "SAFETY") {
      throw new ReturnError(
        "SAFETY_PAUSE",
        "Тренировочные рекомендации приостановлены. Нужен пересмотр или очная оценка.",
        409,
      );
    }
    if (pause.phase !== "RETURN_1" && pause.phase !== "RETURN_2") {
      throw new ReturnError(
        "NOT_NEEDED",
        "Пауза короче 8 дней: возвращение не требуется",
        409,
      );
    }
    if (pause.returnPercent === null) {
      throw new ReturnError("NOT_NEEDED", "Возвращение не требуется", 409);
    }

    const affected: Array<typeof sessions.$inferSelect> = [row.session];
    if (pause.returnSessions > 1) {
      const nextRows = await tx
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.cycleId, row.cycle.id),
            eq(sessions.status, "PLANNED"),
            gt(sessions.sessionIndex, row.session.sessionIndex),
          ),
        )
        .orderBy(asc(sessions.sessionIndex))
        .limit(1)
        .for("update");
      if (nextRows[0]) affected.push(nextRows[0]);
    }

    const targetRirByKey = new Map<string, number>();
    affected.forEach((item, index) => {
      targetRirByKey.set(
        item.sessionKey,
        pause.targetRirs[index] ?? pause.targetRirs.at(-1) ?? 3,
      );
    });
    const affectedKeys = new Set(affected.map((item) => item.sessionKey));

    const baseVersionRows = await tx
      .select()
      .from(planVersions)
      .where(eq(planVersions.id, row.session.planVersionId))
      .limit(1);
    const baseVersion = baseVersionRows[0];
    if (!baseVersion) {
      throw new ReturnError("BROKEN_PLAN", "Версия плана не найдена", 500);
    }

    const oldBlocks = await tx
      .select()
      .from(targetBlocks)
      .where(eq(targetBlocks.planVersionId, baseVersion.id));
    const oldPrescriptions = await tx
      .select({
        prescription: prescriptions,
        exerciseName: exercises.name,
        variantName: exerciseVariants.name,
      })
      .from(prescriptions)
      .innerJoin(
        exerciseVariants,
        eq(prescriptions.exerciseVariantId, exerciseVariants.id),
      )
      .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
      .where(eq(prescriptions.planVersionId, baseVersion.id))
      .orderBy(asc(prescriptions.plannedOrder));

    if (oldPrescriptions.length === 0) {
      throw new ReturnError("BROKEN_PLAN", "В плане нет назначений", 500);
    }

    const versionRows = await tx
      .select({ value: max(planVersions.version) })
      .from(planVersions)
      .where(eq(planVersions.cycleId, row.cycle.id));
    const nextVersion = (versionRows[0]?.value ?? 0) + 1;
    const newVersionId = crypto.randomUUID();
    const decisionId = crypto.randomUUID();
    const recommendationId = crypto.randomUUID();

    await tx.insert(planVersions).values({
      id: newVersionId,
      cycleId: row.cycle.id,
      version: nextVersion,
      parentVersionId: baseVersion.id,
      reason: `Возвращение: ${pause.phase}`,
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
    const changes: ReturnResult["changes"] = [];

    for (const item of oldPrescriptions) {
      const id = crypto.randomUUID();
      prescriptionIdMap.set(item.prescription.id, id);
      const targetBlockId = blockIdMap.get(item.prescription.targetBlockId);
      if (!targetBlockId) {
        throw new ReturnError(
          "BROKEN_PLAN",
          "У назначения отсутствует целевой блок",
          500,
        );
      }
      const isAffected = affectedKeys.has(item.prescription.sessionKey);
      const after = isAffected
        ? applyReturnLoad({
            loadMode: item.prescription.loadMode as LoadMode,
            weightKg: item.prescription.weightKg,
            assistanceKg: item.prescription.assistanceKg,
            addedKg: item.prescription.addedKg,
            incrementKg: item.prescription.incrementKg,
            percent: pause.returnPercent,
          })
        : toLoad(item.prescription);
      const targetRir = isAffected
        ? (targetRirByKey.get(item.prescription.sessionKey) ??
          item.prescription.targetRir)
        : item.prescription.targetRir;

      if (isAffected) {
        changes.push({
          prescriptionId: id,
          exerciseName: item.exerciseName,
          before: toLoad(item.prescription),
          after,
          targetRir,
        });
      }

      await tx.insert(prescriptions).values({
        id,
        planVersionId: newVersionId,
        targetBlockId,
        exerciseVariantId: item.prescription.exerciseVariantId,
        role: item.prescription.role,
        supportsPrimaryId: null,
        sessionKey: item.prescription.sessionKey,
        plannedOrder: item.prescription.plannedOrder,
        optional: item.prescription.optional,
        sets: item.prescription.sets,
        repMin: item.prescription.repMin,
        repMax: item.prescription.repMax,
        targetReps: item.prescription.targetReps,
        targetRir,
        loadMode: item.prescription.loadMode,
        weightKg: after.weightKg,
        assistanceKg: after.assistanceKg,
        addedKg: after.addedKg,
        incrementKg: item.prescription.incrementKg,
        pair: item.prescription.pair,
        sides: item.prescription.sides,
      });
    }

    for (const item of oldPrescriptions) {
      const newId = prescriptionIdMap.get(item.prescription.id);
      if (!newId || !item.prescription.supportsPrimaryId) continue;
      const supportsId = prescriptionIdMap.get(
        item.prescription.supportsPrimaryId,
      );
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

    const affectedIds = affected.map((item) => item.id);
    for (const item of affected) {
      await tx
        .update(sessions)
        .set({ isReturn: true, planVersionId: newVersionId })
        .where(eq(sessions.id, item.id));
    }

    await tx
      .update(recommendations)
      .set({ status: "EXPIRED" })
      .where(
        and(
          eq(recommendations.cycleId, row.cycle.id),
          eq(recommendations.status, "PENDING"),
        ),
      );

    const beforeLoads = changes.map((change) => ({
      prescriptionId: change.prescriptionId,
      exerciseName: change.exerciseName,
      before: change.before,
      after: change.after,
      targetRir: change.targetRir,
    }));

    await tx.insert(recommendations).values({
      id: recommendationId,
      cycleId: row.cycle.id,
      sessionId,
      action: "HOLD",
      scopeType: "SESSION",
      scopeId: sessionId,
      status: "ACCEPTED",
      explanation:
        "Подготовлено возвращение после паузы. Нагрузка снижена, прогрессия временно заблокирована.",
      candidates: {
        reasons: [
          `Пауза ${pause.days} дн.`,
          pause.phase === "RETURN_1"
            ? "Одна сессия возвращения."
            : "Две сессии возвращения.",
        ],
        ruleIds: ["RETURN_PHASE"],
        safety: {
          label: "GREEN",
          reasons: [],
          blockProgression: true,
          pause: false,
          escalate: false,
        },
        changes: changes.map((change) => ({
          prescriptionId: change.prescriptionId,
          weightKg: change.after.weightKg,
          assistanceKg: change.after.assistanceKg,
          addedKg: change.after.addedKg,
          targetRir: change.targetRir,
        })),
      },
      evidence: {
        pauseDays: pause.days,
        phase: pause.phase,
        planVersionId: newVersionId,
        sessions: affectedIds,
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
        pauseDays: pause.days,
        phase: pause.phase,
        loads: beforeLoads,
      },
      after: {
        planVersionId: newVersionId,
        sessions: affectedIds,
        changes: changes.map((change) => ({
          prescriptionId: change.prescriptionId,
          targetRir: change.targetRir,
        })),
      },
    });

    await tx.insert(auditEvents).values({
      userId,
      entity: "session",
      entityId: sessionId,
      eventType: "RETURN_PREPARED",
      payload: {
        phase: pause.phase,
        pauseDays: pause.days,
        percent: pause.returnPercent,
        targetRirs: pause.targetRirs,
        sessions: affectedIds,
        planVersionId: newVersionId,
        changes: changes.map((change) => ({
          prescriptionId: change.prescriptionId,
          before: change.before,
          after: change.after,
          targetRir: change.targetRir,
        })),
      },
      versions: { rules: "1.0.0", plan: nextVersion },
    });

    return {
      sessionId,
      phase: pause.phase,
      planVersionId: newVersionId,
      recommendationId,
      sessions: affectedIds,
      changes,
    };
  });
}
