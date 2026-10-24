import { and, asc, desc, eq, gt, inArray, max } from "drizzle-orm";
import type {
  DecisionInput,
  LoadMode,
  Role,
  SessionRpe,
  Technique,
} from "@chiron/contracts";
import {
  applyChangeToPrescription,
  assessSafety,
  recommendSession,
  type Exposure,
  type PrescriptionSnapshot,
  type ProposalChange,
  type SafetyAssessment,
  type SetRecord,
  type WellnessSnapshot,
} from "@chiron/core";
import {
  auditEvents,
  exerciseVariants,
  exercises,
  getDb,
  planVersions,
  prescriptions,
  recommendations,
  safetyEvents,
  sessionPerformances,
  sessions,
  setPerformances,
  targetBlocks,
  trainingCycles,
  wellnessChecks,
  decisions,
} from "@chiron/db";
import { getExposuresForVariant } from "./plan-service";
import { todayIso } from "./dates";

export interface StoredCandidates {
  reasons: string[];
  ruleIds: string[];
  safety: SafetyAssessment;
  changes: ProposalChange[];
}

export interface RecommendationItem {
  prescriptionId: string;
  exerciseName: string;
  variantName: string;
  role: Role;
  blockName: string;
  before: PrescriptionSnapshot;
  after: PrescriptionSnapshot;
}

export interface RecommendationView {
  id: string;
  sessionId: string | null;
  action: string;
  scopeType: string;
  scopeId: string;
  status: string;
  explanation: string;
  reasons: string[];
  ruleIds: string[];
  safety: SafetyAssessment;
  changes: ProposalChange[];
  items: RecommendationItem[];
  createdAt: Date;
}

export class RecommendationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RecommendationError";
  }
}

function toSnapshot(row: {
  prescription: typeof prescriptions.$inferSelect;
  variantName: string;
  exerciseName: string;
  blockKey: string;
  blockName: string;
}): PrescriptionSnapshot {
  return {
    id: row.prescription.id,
    exerciseVariantId: row.prescription.exerciseVariantId,
    exerciseName: row.exerciseName,
    role: row.prescription.role as Role,
    targetBlockKey: row.blockKey,
    targetBlockName: row.blockName,
    supportsPrimaryId: row.prescription.supportsPrimaryId,
    plannedOrder: row.prescription.plannedOrder,
    optional: row.prescription.optional,
    sets: row.prescription.sets,
    repMin: row.prescription.repMin,
    repMax: row.prescription.repMax,
    targetReps: row.prescription.targetReps,
    targetRir: row.prescription.targetRir,
    loadMode: row.prescription.loadMode as LoadMode,
    weightKg: row.prescription.weightKg,
    assistanceKg: row.prescription.assistanceKg,
    addedKg: row.prescription.addedKg,
    incrementKg: row.prescription.incrementKg,
    pair: row.prescription.pair,
    sides: row.prescription.sides,
  };
}

function parseCandidates(value: unknown): StoredCandidates {
  const candidate = value as Partial<StoredCandidates> | null;
  return {
    reasons: Array.isArray(candidate?.reasons) ? candidate.reasons : [],
    ruleIds: Array.isArray(candidate?.ruleIds) ? candidate.ruleIds : [],
    safety:
      candidate?.safety ??
      ({
        label: "GREEN",
        reasons: [],
        blockProgression: false,
        pause: false,
        escalate: false,
      } satisfies SafetyAssessment),
    changes: Array.isArray(candidate?.changes) ? candidate.changes : [],
  };
}

async function loadPrescriptionRows(ids: string[]) {
  if (ids.length === 0) return [];
  const db = getDb();
  return db
    .select({
      prescription: prescriptions,
      variantName: exerciseVariants.name,
      exerciseName: exercises.name,
      blockKey: targetBlocks.key,
      blockName: targetBlocks.name,
    })
    .from(prescriptions)
    .innerJoin(
      exerciseVariants,
      eq(prescriptions.exerciseVariantId, exerciseVariants.id),
    )
    .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
    .innerJoin(targetBlocks, eq(prescriptions.targetBlockId, targetBlocks.id))
    .where(inArray(prescriptions.id, ids));
}

async function buildRecommendationView(
  row: typeof recommendations.$inferSelect,
): Promise<RecommendationView> {
  const candidates = parseCandidates(row.candidates);
  const rows = await loadPrescriptionRows(
    candidates.changes.map((change) => change.prescriptionId),
  );
  const rowById = new Map(rows.map((item) => [item.prescription.id, item]));
  const items: RecommendationItem[] = [];

  for (const change of candidates.changes) {
    const source = rowById.get(change.prescriptionId);
    if (!source) continue;
    const before = toSnapshot(source);
    items.push({
      prescriptionId: change.prescriptionId,
      exerciseName: source.exerciseName,
      variantName: source.variantName,
      role: before.role,
      blockName: source.blockName,
      before,
      after: applyChangeToPrescription(before, change),
    });
  }

  return {
    id: row.id,
    sessionId: row.sessionId,
    action: row.action,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    status: row.status,
    explanation: row.explanation,
    reasons: candidates.reasons,
    ruleIds: candidates.ruleIds,
    safety: candidates.safety,
    changes: candidates.changes,
    items,
    createdAt: row.createdAt,
  };
}

export async function getPendingRecommendations(
  userId: string,
): Promise<RecommendationView[]> {
  const db = getDb();
  const rows = await db
    .select({ recommendation: recommendations })
    .from(recommendations)
    .innerJoin(trainingCycles, eq(recommendations.cycleId, trainingCycles.id))
    .where(
      and(
        eq(trainingCycles.userId, userId),
        eq(trainingCycles.status, "ACTIVE"),
        eq(recommendations.status, "PENDING"),
        gt(recommendations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(recommendations.createdAt));

  const views: RecommendationView[] = [];
  for (const row of rows) {
    views.push(await buildRecommendationView(row.recommendation));
  }
  return views;
}

export async function getRecommendation(
  userId: string,
  recommendationId: string,
): Promise<RecommendationView | null> {
  const db = getDb();
  const rows = await db
    .select({ recommendation: recommendations })
    .from(recommendations)
    .innerJoin(trainingCycles, eq(recommendations.cycleId, trainingCycles.id))
    .where(
      and(
        eq(recommendations.id, recommendationId),
        eq(trainingCycles.userId, userId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? buildRecommendationView(row.recommendation) : null;
}

function mapWellness(
  row: typeof wellnessChecks.$inferSelect | undefined,
): WellnessSnapshot | null {
  if (!row) return null;
  return {
    sleepHours: row.sleepHours,
    sleepQuality: row.sleepQuality,
    fatigue: row.fatigue,
    stress: row.stress,
    motivation: row.motivation,
    soreness: (row.soreness as WellnessSnapshot["soreness"]) ?? null,
    symptom: row.symptom,
    symptomText: row.symptomText,
    illness: (row.illness as WellnessSnapshot["illness"]) ?? null,
  };
}

export async function createSessionRecommendations(
  input: {
    userId: string;
    sessionId: string;
    sessionRpe: SessionRpe;
    comment: string | null;
  },
  options: { today?: string } = {},
): Promise<RecommendationView[]> {
  const db = getDb();
  const today = options.today ?? todayIso();
  const sessionRows = await db
    .select({ session: sessions, cycle: trainingCycles })
    .from(sessions)
    .innerJoin(trainingCycles, eq(sessions.cycleId, trainingCycles.id))
    .where(
      and(
        eq(sessions.id, input.sessionId),
        eq(trainingCycles.userId, input.userId),
      ),
    )
    .limit(1);
  const sessionRow = sessionRows[0];
  if (!sessionRow) {
    throw new RecommendationError("NOT_FOUND", "Тренировка не найдена");
  }
  if (sessionRow.cycle.status !== "ACTIVE") {
    throw new RecommendationError(
      "CYCLE_CLOSED",
      "Цикл уже закрыт; новые рекомендации не создаются",
    );
  }

  if (sessionRow.session.status === "COMPLETED") {
    const existing = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.sessionId, input.sessionId))
      .orderBy(desc(recommendations.createdAt));
    const views: RecommendationView[] = [];
    for (const row of existing) {
      views.push(await buildRecommendationView(row));
    }
    return views;
  }

  if (sessionRow.session.status === "SKIPPED") {
    throw new RecommendationError(
      "SESSION_SKIPPED",
      "Пропущенную тренировку нельзя завершить",
    );
  }

  await db
    .update(sessions)
    .set({ status: "COMPLETED", actualDate: today })
    .where(eq(sessions.id, input.sessionId));

  await db
    .insert(sessionPerformances)
    .values({
      sessionId: input.sessionId,
      sessionRpe: input.sessionRpe,
      comment: input.comment,
      completedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: sessionPerformances.sessionId,
      set: {
        sessionRpe: input.sessionRpe,
        comment: input.comment,
        completedAt: new Date(),
      },
    });

  const wellnessRows = await db
    .select()
    .from(wellnessChecks)
    .where(eq(wellnessChecks.userId, input.userId))
    .orderBy(desc(wellnessChecks.createdAt))
    .limit(1);
  const wellness = mapWellness(wellnessRows[0]);

  const globalSafety = assessSafety({
    text: input.comment,
    wellness,
  });

  const prescriptionRows = await db
    .select({
      prescription: prescriptions,
      variantName: exerciseVariants.name,
      exerciseName: exercises.name,
      blockKey: targetBlocks.key,
      blockName: targetBlocks.name,
    })
    .from(prescriptions)
    .innerJoin(
      exerciseVariants,
      eq(prescriptions.exerciseVariantId, exerciseVariants.id),
    )
    .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
    .innerJoin(targetBlocks, eq(prescriptions.targetBlockId, targetBlocks.id))
    .where(
      and(
        eq(prescriptions.planVersionId, sessionRow.session.planVersionId),
        eq(prescriptions.sessionKey, sessionRow.session.sessionKey),
      ),
    )
    .orderBy(asc(prescriptions.plannedOrder));

  const setRows = await db
    .select()
    .from(setPerformances)
    .where(eq(setPerformances.sessionId, input.sessionId));

  const primaries: Array<{
    prescription: PrescriptionSnapshot;
    exposures: Exposure[];
    safety?: SafetyAssessment;
  }> = [];

  for (const row of prescriptionRows) {
    const hasSets = setRows.some(
      (set) => set.prescriptionId === row.prescription.id,
    );
    if (row.prescription.role !== "PRIMARY" && !hasSets) {
      // An empty optional slot is a valid decision, not a missed exercise.
      continue;
    }
    const snapshot = toSnapshot(row);
    const exposures = await getExposuresForVariant(
      sessionRow.cycle.id,
      row.prescription.exerciseVariantId,
      { limit: 5, today },
    );
    const pain = setRows.some(
      (set) => set.prescriptionId === row.prescription.id && set.pain,
    );
    primaries.push({
      prescription: snapshot,
      exposures,
      safety: pain
        ? assessSafety({ text: "боль", wellness })
        : globalSafety,
    });
  }

  const drafts = recommendSession({
    sessionId: input.sessionId,
    primaries,
    wellness,
    sessionRpe: input.sessionRpe,
    safety: globalSafety,
    returnPhase: sessionRow.session.isReturn,
  });

  const timestamp = new Date();
  const expiresAt = new Date(timestamp.getTime() + 7 * 86_400_000);

  const inserted = await db.transaction(async (tx) => {
    await tx
      .update(recommendations)
      .set({ status: "EXPIRED" })
      .where(
        and(
          eq(recommendations.cycleId, sessionRow.cycle.id),
          eq(recommendations.status, "PENDING"),
        ),
      );

    const rows: Array<typeof recommendations.$inferSelect> = [];
    for (const draft of drafts) {
      const changes: StoredCandidates = {
        reasons: draft.reasons,
        ruleIds: draft.ruleIds,
        safety: draft.safety,
        changes: draft.changes,
      };
      const result = await tx
        .insert(recommendations)
        .values({
          cycleId: sessionRow.cycle.id,
          sessionId: input.sessionId,
          action: draft.action,
          scopeType: draft.scopeType,
          scopeId: draft.scopeId,
          status: "PENDING",
          explanation: draft.explanation,
          candidates: changes,
          evidence: {
            exposures: primaries.map((item) => ({
              prescriptionId: item.prescription.id,
              exposures: item.exposures.length,
            })),
          },
          rulesVersion: "1.0.0",
          promptVersion: "rules-only",
          modelVersion: "deterministic",
          expiresAt,
        })
        .returning();
      if (result[0]) rows.push(result[0]);
    }

    if (globalSafety.label === "RED") {
      await tx.insert(safetyEvents).values({
        userId: input.userId,
        sessionId: input.sessionId,
        label: globalSafety.label,
        severity: "RED",
        source: "session_feedback",
        scope: "SESSION",
        resolution: "PAUSE",
      });
    }

    await tx.insert(auditEvents).values({
      userId: input.userId,
      entity: "session",
      entityId: input.sessionId,
      eventType: "SESSION_COMPLETED",
      payload: {
        sessionRpe: input.sessionRpe,
        recommendations: rows.map((row) => row.id),
      },
      versions: { rules: "1.0.0", prompt: "rules-only" },
    });

    return rows;
  });

  const views: RecommendationView[] = [];
  for (const row of inserted) {
    views.push(await buildRecommendationView(row));
  }
  return views;
}

function ensureEditableChange(
  change: ProposalChange,
  original: PrescriptionSnapshot,
  action: string,
): void {
  if (action === "PAUSE" || action === "ESCALATE") {
    throw new RecommendationError(
      "SAFETY_LOCKED",
      "Это решение нельзя изменить в сторону тренировочных изменений",
    );
  }

  const maxWeight =
    original.weightKg === null
      ? null
      : original.weightKg + original.incrementKg + 1e-9;
  const minAssistance =
    original.assistanceKg === null
      ? null
      : Math.max(0, original.assistanceKg - original.incrementKg - 1e-9);
  const maxAdded =
    original.addedKg === null
      ? null
      : original.addedKg + original.incrementKg + 1e-9;

  if (
    change.weightKg !== undefined &&
    change.weightKg !== null &&
    maxWeight !== null &&
    change.weightKg > maxWeight
  ) {
    throw new RecommendationError(
      "EDIT_OUT_OF_BOUNDS",
      "Вес больше одного шага за решение",
    );
  }
  if (
    change.assistanceKg !== undefined &&
    change.assistanceKg !== null &&
    minAssistance !== null &&
    change.assistanceKg < minAssistance
  ) {
    throw new RecommendationError(
      "EDIT_OUT_OF_BOUNDS",
      "Помощь уменьшается больше чем на один шаг",
    );
  }
  if (
    change.addedKg !== undefined &&
    change.addedKg !== null &&
    maxAdded !== null &&
    change.addedKg > maxAdded
  ) {
    throw new RecommendationError(
      "EDIT_OUT_OF_BOUNDS",
      "Добавленный вес больше одного шага за решение",
    );
  }
  if (
    change.targetReps !== undefined &&
    change.targetReps !== null &&
    (change.targetReps < original.repMin ||
      change.targetReps > original.repMax)
  ) {
    throw new RecommendationError(
      "EDIT_OUT_OF_BOUNDS",
      "Повторы вне разрешённого диапазона",
    );
  }
  if (
    change.sets !== undefined &&
    change.sets !== null &&
    (change.sets < 1 || change.sets > 4)
  ) {
    throw new RecommendationError(
      "EDIT_OUT_OF_BOUNDS",
      "Число подходов вне разрешённого диапазона",
    );
  }

  if (
    (action === "HOLD" ||
      action === "LOCAL_REDUCE" ||
      action === "DELOAD") &&
    change.weightKg !== undefined &&
    change.weightKg !== null &&
    original.weightKg !== null &&
    change.weightKg > original.weightKg
  ) {
    throw new RecommendationError(
      "EDIT_OUT_OF_BOUNDS",
      "Это решение не может повышать вес",
    );
  }
  if (
    (action === "HOLD" || action === "LOCAL_REDUCE" || action === "DELOAD") &&
    change.sets !== undefined &&
    change.sets !== null &&
    change.sets > original.sets
  ) {
    throw new RecommendationError(
      "EDIT_OUT_OF_BOUNDS",
      "Это решение не может добавлять подходы",
    );
  }
}

export async function applyDecision(input: {
  userId: string;
  recommendationId: string;
  decision: DecisionInput;
}): Promise<{ outcome: string; planVersionId: string | null }> {
  const db = getDb();
  const rows = await db
    .select({ recommendation: recommendations, cycle: trainingCycles })
    .from(recommendations)
    .innerJoin(trainingCycles, eq(recommendations.cycleId, trainingCycles.id))
    .where(
      and(
        eq(recommendations.id, input.recommendationId),
        eq(trainingCycles.userId, input.userId),
      ),
    )
    .limit(1);
  const found = rows[0];
  if (!found) {
    throw new RecommendationError("NOT_FOUND", "Рекомендация не найдена");
  }
  if (found.cycle.status !== "ACTIVE") {
    throw new RecommendationError(
      "CYCLE_CLOSED",
      "Цикл уже закрыт; рекомендация не применяется",
    );
  }
  if (found.recommendation.status !== "PENDING") {
    throw new RecommendationError(
      "ALREADY_DECIDED",
      "Рекомендация уже обработана",
    );
  }
  if (
    found.recommendation.expiresAt &&
    found.recommendation.expiresAt.getTime() < Date.now()
  ) {
    throw new RecommendationError(
      "EXPIRED",
      "Рекомендация устарела. Завершите следующую тренировку.",
    );
  }

  const candidates = parseCandidates(found.recommendation.candidates);
  const originalRows = await loadPrescriptionRows(
    candidates.changes.map((change) => change.prescriptionId),
  );
  const originalById = new Map(
    originalRows.map((row) => [row.prescription.id, toSnapshot(row)]),
  );

  const outcome = input.decision.outcome;
  const action = found.recommendation.action;

  if (outcome === "REJECTED") {
    await db.transaction(async (tx) => {
      await tx.insert(decisions).values({
        recommendationId: found.recommendation.id,
        userId: input.userId,
        outcome,
        reasonCategory: input.decision.reasonCategory,
        comment: input.decision.comment,
        before: candidates,
        after: { applied: false },
      });
      await tx
        .update(recommendations)
        .set({ status: "REJECTED" })
        .where(eq(recommendations.id, found.recommendation.id));
      await tx.insert(auditEvents).values({
        userId: input.userId,
        entity: "recommendation",
        entityId: found.recommendation.id,
        eventType: "RECOMMENDATION_REJECTED",
        payload: {
          reasonCategory: input.decision.reasonCategory,
          comment: input.decision.comment,
        },
        versions: { rules: found.recommendation.rulesVersion },
      });
    });
    return { outcome, planVersionId: null };
  }

  if (action === "PAUSE" || action === "ESCALATE") {
    if (input.decision.edits.length > 0) {
      throw new RecommendationError(
        "SAFETY_LOCKED",
        "Это решение нельзя изменить в сторону тренировочных изменений",
      );
    }
    await db.transaction(async (tx) => {
      await tx.insert(decisions).values({
        recommendationId: found.recommendation.id,
        userId: input.userId,
        outcome,
        reasonCategory: input.decision.reasonCategory,
        comment: input.decision.comment,
        before: candidates,
        after: { acknowledged: true },
      });
      await tx
        .update(recommendations)
        .set({ status: outcome })
        .where(eq(recommendations.id, found.recommendation.id));
      await tx.insert(auditEvents).values({
        userId: input.userId,
        entity: "recommendation",
        entityId: found.recommendation.id,
        eventType: "SAFETY_ACKNOWLEDGED",
        payload: { action },
        versions: { rules: found.recommendation.rulesVersion },
      });
    });
    return { outcome, planVersionId: null };
  }

  if (
    action === "HOLD" &&
    input.decision.edits.length === 0 &&
    candidates.changes.length === 0
  ) {
    await db.transaction(async (tx) => {
      await tx.insert(decisions).values({
        recommendationId: found.recommendation.id,
        userId: input.userId,
        outcome,
        reasonCategory: input.decision.reasonCategory,
        comment: input.decision.comment,
        before: candidates,
        after: { applied: true, planChanged: false },
      });
      await tx
        .update(recommendations)
        .set({ status: outcome })
        .where(eq(recommendations.id, found.recommendation.id));
      await tx.insert(auditEvents).values({
        userId: input.userId,
        entity: "recommendation",
        entityId: found.recommendation.id,
        eventType: "RECOMMENDATION_ACCEPTED_NO_CHANGE",
        payload: { action },
        versions: { rules: found.recommendation.rulesVersion },
      });
    });
    return { outcome, planVersionId: null };
  }

  const edits: ProposalChange[] =
    input.decision.edits.length > 0
      ? input.decision.edits.map((edit) => ({
          prescriptionId: edit.prescriptionId,
          weightKg: edit.weightKg,
          assistanceKg: edit.assistanceKg,
          addedKg: edit.addedKg,
          targetReps: edit.targetReps,
          sets: edit.sets,
        }))
      : candidates.changes.map((change) => ({ ...change }));

  const allowedPrescriptionIds = new Set(
    candidates.changes.map((change) => change.prescriptionId),
  );
  for (const edit of edits) {
    if (!allowedPrescriptionIds.has(edit.prescriptionId)) {
      throw new RecommendationError(
        "EDIT_OUT_OF_SCOPE",
        "Изменение выходит за область рекомендации",
      );
    }
    const original = originalById.get(edit.prescriptionId);
    if (!original) {
      throw new RecommendationError(
        "NOT_FOUND",
        "Назначение для изменения не найдено",
      );
    }
    ensureEditableChange(edit, original, action);
  }

  const currentVersionId = found.cycle.currentPlanVersionId;
  if (!currentVersionId) {
    throw new RecommendationError(
      "NO_PLAN_VERSION",
      "У цикла нет активной версии плана",
    );
  }

  const currentVersionRows = await db
    .select()
    .from(planVersions)
    .where(eq(planVersions.id, currentVersionId))
    .limit(1);
  const currentVersion = currentVersionRows[0];
  if (!currentVersion) {
    throw new RecommendationError("NOT_FOUND", "Версия плана не найдена");
  }

  const newVersionId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();
  const editByPrescription = new Map(
    edits.map((edit) => [edit.prescriptionId, edit]),
  );

  await db.transaction(async (tx) => {
    await tx
      .select({ id: trainingCycles.id })
      .from(trainingCycles)
      .where(eq(trainingCycles.id, found.cycle.id))
      .for("update");

    const versionRows = await tx
      .select({ value: max(planVersions.version) })
      .from(planVersions)
      .where(eq(planVersions.cycleId, found.cycle.id));
    const nextVersion = (versionRows[0]?.value ?? 0) + 1;

    await tx.insert(planVersions).values({
      id: newVersionId,
      cycleId: found.cycle.id,
      version: nextVersion,
      parentVersionId: currentVersion.id,
      reason: `Решение: ${action}`,
      decisionId,
      rulesVersion: "1.0.0",
    });

    const oldBlocks = await tx
      .select()
      .from(targetBlocks)
      .where(eq(targetBlocks.planVersionId, currentVersion.id));
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
      .where(eq(prescriptions.planVersionId, currentVersion.id));
    const prescriptionIdMap = new Map<string, string>();

    for (const item of oldPrescriptions) {
      const id = crypto.randomUUID();
      prescriptionIdMap.set(item.id, id);
      const change = editByPrescription.get(item.id);
      const targetBlockId = blockIdMap.get(item.targetBlockId);
      if (!targetBlockId) {
        throw new RecommendationError(
          "BROKEN_PLAN",
          "У назначения отсутствует целевой блок",
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
        sets:
          change?.sets === undefined || change.sets === null
            ? item.sets
            : change.sets,
        repMin: item.repMin,
        repMax: item.repMax,
        targetReps:
          change?.targetReps === undefined || change.targetReps === null
            ? item.targetReps
            : change.targetReps,
        targetRir: item.targetRir,
        loadMode: item.loadMode,
        weightKg:
          change?.weightKg === undefined || change.weightKg === null
            ? item.weightKg
            : change.weightKg,
        assistanceKg:
          change?.assistanceKg === undefined || change.assistanceKg === null
            ? item.assistanceKg
            : change.assistanceKg,
        addedKg:
          change?.addedKg === undefined || change.addedKg === null
            ? item.addedKg
            : change.addedKg,
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
      .where(eq(trainingCycles.id, found.cycle.id));

    await tx
      .update(sessions)
      .set({ planVersionId: newVersionId })
      .where(
        and(
          eq(sessions.cycleId, found.cycle.id),
          eq(sessions.status, "PLANNED"),
          eq(sessions.isReturn, false),
        ),
      );

    await tx.insert(decisions).values({
      id: decisionId,
      recommendationId: found.recommendation.id,
      userId: input.userId,
      outcome,
      reasonCategory: input.decision.reasonCategory,
      comment: input.decision.comment,
      before: candidates,
      after: {
        action,
        changes: edits,
        planVersionId: newVersionId,
      },
    });

    await tx
      .update(recommendations)
      .set({ status: outcome })
      .where(eq(recommendations.id, found.recommendation.id));

    const otherPending = await tx
      .select()
      .from(recommendations)
      .where(
        and(
          eq(recommendations.cycleId, found.cycle.id),
          eq(recommendations.status, "PENDING"),
        ),
      );
    for (const other of otherPending) {
      const stored = parseCandidates(other.candidates);
      const remapped: StoredCandidates = {
        ...stored,
        changes: stored.changes.map((change) => ({
          ...change,
          prescriptionId:
            prescriptionIdMap.get(change.prescriptionId) ??
            change.prescriptionId,
        })),
      };
      await tx
        .update(recommendations)
        .set({
          candidates: remapped,
          scopeId: prescriptionIdMap.get(other.scopeId) ?? other.scopeId,
        })
        .where(eq(recommendations.id, other.id));
    }

    await tx.insert(auditEvents).values({
      userId: input.userId,
      entity: "plan_version",
      entityId: newVersionId,
      eventType: "PLAN_VERSION_CREATED",
      payload: {
        recommendationId: found.recommendation.id,
        decisionId,
        action,
        changes: edits,
      },
      versions: {
        rules: found.recommendation.rulesVersion,
        plan: nextVersion,
      },
    });
  });

  return { outcome, planVersionId: newVersionId };
}

export function recommendationNeedsPlanChange(action: string): boolean {
  return !["PAUSE", "ESCALATE"].includes(action);
}
