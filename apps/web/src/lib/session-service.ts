import { and, eq, gt, inArray } from "drizzle-orm";
import type { SetPerformanceInput, WellnessInput } from "@chiron/contracts";
import {
  auditEvents,
  getDb,
  recommendations,
  safetyEvents,
  sessions,
  sessionPrescriptionSkips,
  setPerformances,
  wellnessChecks,
} from "@chiron/db";
import { getSessionView } from "./plan-service";
import { getPauseStateForUser } from "./return-service";
import { todayIso } from "./dates";

export class SessionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

function ensureActiveCycle(view: Awaited<ReturnType<typeof getSessionView>>) {
  if (view && view.cycle.status !== "ACTIVE") {
    throw new SessionError(
      "CYCLE_CLOSED",
      "Цикл закрыт; тренировка недоступна для изменений",
      409,
    );
  }
}

export async function startSession(
  userId: string,
  sessionId: string,
  options: { today?: string; actorUserId?: string } = {},
): Promise<void> {
  const view = await getSessionView(sessionId, userId);
  if (!view) {
    throw new SessionError("NOT_FOUND", "Тренировка не найдена", 404);
  }
  ensureActiveCycle(view);
  if (view.session.status === "COMPLETED") {
    throw new SessionError("ALREADY_COMPLETED", "Тренировка уже завершена", 409);
  }
  if (view.session.status === "SKIPPED") {
    throw new SessionError("SESSION_SKIPPED", "Тренировка пропущена", 409);
  }

  const pause = await getPauseStateForUser(userId, view.cycle, options);
  if (pause.phase === "LONG") {
    throw new SessionError(
      "CYCLE_REVIEW_REQUIRED",
      "После паузы нужно пересмотреть цикл",
      409,
    );
  }
  if (pause.phase === "SAFETY") {
    throw new SessionError(
      "SAFETY_PAUSE",
      "Тренировочные рекомендации приостановлены. Нужен пересмотр или очная оценка.",
      409,
    );
  }
  if (
    (pause.phase === "RETURN_1" || pause.phase === "RETURN_2") &&
    !view.session.isReturn
  ) {
    throw new SessionError(
      "RETURN_REQUIRED",
      "Сначала подготовьте возвращение после паузы",
      409,
    );
  }

  if (view.session.status === "PLANNED") {
    await getDb()
      .update(sessions)
      .set({ status: "IN_PROGRESS" })
      .where(eq(sessions.id, sessionId));
    await getDb().insert(auditEvents).values({
      userId,
      actorUserId: options.actorUserId ?? userId,
      entity: "session",
      entityId: sessionId,
      eventType: "SESSION_STARTED",
      payload: { sessionIndex: view.session.sessionIndex },
      versions: { rules: "1.0.0" },
    });
  }
}

export async function skipSessionExercise(
  userId: string,
  sessionId: string,
  prescriptionId: string,
  actorUserId?: string,
): Promise<void> {
  const view = await getSessionView(sessionId, userId);
  if (!view) {
    throw new SessionError("NOT_FOUND", "Тренировка не найдена", 404);
  }
  ensureActiveCycle(view);
  if (view.session.status === "COMPLETED") {
    throw new SessionError(
      "ALREADY_COMPLETED",
      "Тренировка уже завершена",
      409,
    );
  }
  if (view.session.status === "SKIPPED") {
    throw new SessionError("SESSION_SKIPPED", "Тренировка пропущена", 409);
  }
  const prescription = view.blocks
    .flatMap((block) => block.prescriptions)
    .find((item) => item.id === prescriptionId);
  if (!prescription) {
    throw new SessionError("NOT_FOUND", "Упражнение не найдено", 404);
  }
  if (prescription.role === "PRIMARY") {
    throw new SessionError(
      "PRIMARY_EXERCISE",
      "Основное упражнение нельзя убрать; его можно заменить",
      409,
    );
  }
  const savedSets = view.sets.filter(
    (set) => set.prescriptionId === prescriptionId,
  );
  if (savedSets.length > 0) {
    throw new SessionError(
      "EXERCISE_HAS_SETS",
      "По упражнению уже есть подходы; убрать нельзя",
      409,
    );
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(sessionPrescriptionSkips)
      .values({ sessionId, prescriptionId })
      .onConflictDoNothing();
    await tx.insert(auditEvents).values({
      userId,
      actorUserId: actorUserId ?? userId,
      entity: "session",
      entityId: sessionId,
      eventType: "EXERCISE_SKIPPED",
      payload: { prescriptionId, exerciseVariantId: prescription.exerciseVariantId },
      versions: { rules: "1.0.0" },
    });
  });
}

export async function reopenSession(
  userId: string,
  sessionId: string,
  actorUserId?: string,
): Promise<void> {
  const view = await getSessionView(sessionId, userId);
  if (!view) {
    throw new SessionError("NOT_FOUND", "Тренировка не найдена", 404);
  }
  ensureActiveCycle(view);
  if (view.session.status !== "COMPLETED") {
    throw new SessionError(
      "NOT_COMPLETED",
      "Вернуть в работу можно только завершённую тренировку",
      409,
    );
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: sessions.id,
        cycleId: sessions.cycleId,
        sessionIndex: sessions.sessionIndex,
        actualDate: sessions.actualDate,
        status: sessions.status,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .for("update");
    const session = rows[0];
    if (!session) {
      throw new SessionError("NOT_FOUND", "Тренировка не найдена", 404);
    }
    if (session.status !== "COMPLETED") {
      throw new SessionError(
        "NOT_COMPLETED",
        "Тренировка уже не завершена",
        409,
      );
    }

    const later = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.cycleId, session.cycleId),
          gt(sessions.sessionIndex, session.sessionIndex),
          inArray(sessions.status, ["COMPLETED", "IN_PROGRESS"]),
        ),
      )
      .limit(1);
    if (later.length > 0) {
      throw new SessionError(
        "LATER_SESSION_EXISTS",
        "Нельзя исправить: после этой тренировки уже начата или завершена следующая",
        409,
      );
    }

    const safety = await tx
      .select({ id: safetyEvents.id })
      .from(safetyEvents)
      .where(eq(safetyEvents.sessionId, sessionId))
      .limit(1);
    if (safety.length > 0) {
      throw new SessionError(
        "SAFETY_EVENT_EXISTS",
        "Нельзя исправить: по тренировке есть сигнал безопасности. Нужен пересмотр цикла.",
        409,
      );
    }

    const recs = await tx
      .select({ id: recommendations.id, status: recommendations.status })
      .from(recommendations)
      .where(eq(recommendations.sessionId, sessionId));
    const decided = recs.some(
      (row) =>
        row.status !== "PENDING" &&
        row.status !== "EXPIRED" &&
        row.status !== "SUPERSEDED",
    );
    if (decided) {
      throw new SessionError(
        "DECISION_EXISTS",
        "Нельзя исправить: по тренировке уже принято решение. Изменения — через пересмотр цикла.",
        409,
      );
    }

    const superseded = recs.filter((row) => row.status === "PENDING").length;
    if (superseded > 0) {
      await tx
        .update(recommendations)
        .set({ status: "SUPERSEDED" })
        .where(
          and(
            eq(recommendations.sessionId, sessionId),
            eq(recommendations.status, "PENDING"),
          ),
        );
    }

    await tx
      .update(sessions)
      .set({ status: "IN_PROGRESS" })
      .where(eq(sessions.id, sessionId));

    await tx.insert(auditEvents).values({
      userId,
      actorUserId: actorUserId ?? userId,
      entity: "session",
      entityId: sessionId,
      eventType: "SESSION_REOPENED",
      payload: {
        previousActualDate: session.actualDate,
        supersededRecommendations: superseded,
      },
      versions: { rules: "1.0.0" },
    });
  });
}

export async function upsertSet(
  userId: string,
  sessionId: string,
  input: SetPerformanceInput,
  _actorUserId?: string,
): Promise<typeof setPerformances.$inferSelect> {
  const view = await getSessionView(sessionId, userId);
  if (!view) {
    throw new SessionError("NOT_FOUND", "Тренировка не найдена", 404);
  }
  ensureActiveCycle(view);
  if (view.session.status === "COMPLETED") {
    throw new SessionError("ALREADY_COMPLETED", "Тренировка уже завершена", 409);
  }
  if (view.session.status === "SKIPPED") {
    throw new SessionError("SESSION_SKIPPED", "Тренировка пропущена", 409);
  }
  const prescription = view.blocks
    .flatMap((block) => block.prescriptions)
    .find((item) => item.id === input.prescriptionId);
  if (!prescription) {
    throw new SessionError(
      "OUT_OF_SCOPE",
      "Упражнение не относится к этой тренировке",
      422,
    );
  }

  if (view.session.status === "PLANNED") {
    await getDb()
      .update(sessions)
      .set({ status: "IN_PROGRESS" })
      .where(eq(sessions.id, sessionId));
  }

  const db = getDb();
  const rows = await db
    .insert(setPerformances)
    .values({
      sessionId,
      prescriptionId: input.prescriptionId,
      clientSetId: input.clientSetId,
      setType: input.setType,
      weightKg: input.weightKg,
      assistanceKg: input.assistanceKg,
      addedKg: input.addedKg,
      reps: input.reps,
      rir: input.rir,
      technique: input.technique,
      pain: input.pain,
      completed: input.completed,
      actualOrder: input.actualOrder,
    })
    .onConflictDoUpdate({
      target: [setPerformances.sessionId, setPerformances.clientSetId],
      set: {
        setType: input.setType,
        weightKg: input.weightKg,
        assistanceKg: input.assistanceKg,
        addedKg: input.addedKg,
        reps: input.reps,
        rir: input.rir,
        technique: input.technique,
        pain: input.pain,
        completed: input.completed,
        actualOrder: input.actualOrder,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) throw new SessionError("NOT_SAVED", "Подход не сохранён", 500);
  return row;
}

export async function deleteSet(
  userId: string,
  sessionId: string,
  clientSetId: string,
  actorUserId?: string,
): Promise<void> {
  const view = await getSessionView(sessionId, userId);
  if (!view) {
    throw new SessionError("NOT_FOUND", "Тренировка не найдена", 404);
  }
  ensureActiveCycle(view);
  if (view.session.status === "COMPLETED") {
    throw new SessionError(
      "ALREADY_COMPLETED",
      "Сначала верните тренировку в работу",
      409,
    );
  }
  if (view.session.status === "SKIPPED") {
    throw new SessionError("SESSION_SKIPPED", "Тренировка пропущена", 409);
  }

  const rows = await getDb()
    .delete(setPerformances)
    .where(
      and(
        eq(setPerformances.sessionId, sessionId),
        eq(setPerformances.clientSetId, clientSetId),
      ),
    )
    .returning();
  const deleted = rows[0];
  if (!deleted) {
    throw new SessionError("SET_NOT_FOUND", "Подход не найден", 404);
  }

  await getDb().insert(auditEvents).values({
    userId,
    actorUserId: actorUserId ?? userId,
    entity: "session",
    entityId: sessionId,
    eventType: "SET_DELETED",
    payload: {
      clientSetId,
      prescriptionId: deleted.prescriptionId,
      reps: deleted.reps,
      weightKg: deleted.weightKg,
      assistanceKg: deleted.assistanceKg,
      addedKg: deleted.addedKg,
    },
    versions: { rules: "1.0.0" },
  });
}

export async function saveWellness(
  userId: string,
  sessionId: string,
  input: WellnessInput,
  _actorUserId?: string,
): Promise<void> {
  const view = await getSessionView(sessionId, userId);
  if (!view) {
    throw new SessionError("NOT_FOUND", "Тренировка не найдена", 404);
  }
  ensureActiveCycle(view);
  await getDb()
    .insert(wellnessChecks)
    .values({
      userId,
      sessionId,
      recordedAt: todayIso(),
      sleepHours: input.sleepHours,
      sleepQuality: input.sleepQuality,
      fatigue: input.fatigue,
      stress: input.stress,
      motivation: input.motivation,
      soreness: input.soreness,
      symptom: input.symptom,
      symptomText: input.symptomText,
      illness: input.illness,
    });
}

export async function markSessionSkipped(
  userId: string,
  sessionId: string,
  reason: "NO_TIME" | "ILLNESS" | "EQUIPMENT" | "OTHER",
  comment: string | null = null,
  actorUserId?: string,
): Promise<void> {
  const view = await getSessionView(sessionId, userId);
  if (!view) {
    throw new SessionError("NOT_FOUND", "Тренировка не найдена", 404);
  }
  ensureActiveCycle(view);
  if (view.session.status === "COMPLETED") {
    throw new SessionError("ALREADY_COMPLETED", "Тренировка уже завершена", 409);
  }
  if (view.session.status !== "PLANNED") {
    throw new SessionError(
      "CANNOT_SKIP",
      "Нельзя пропустить уже начатую тренировку",
      409,
    );
  }
  await getDb()
    .update(sessions)
    .set({ status: "SKIPPED" })
    .where(and(eq(sessions.id, sessionId), eq(sessions.status, "PLANNED")));
  await getDb().insert(auditEvents).values({
    userId,
    actorUserId: actorUserId ?? userId,
    entity: "session",
    entityId: sessionId,
    eventType: "SESSION_SKIPPED",
    payload: { reason, comment },
    versions: { rules: "1.0.0" },
  });
}

export async function saveWeeklyWellness(
  userId: string,
  input: WellnessInput,
): Promise<void> {
  await getDb().insert(wellnessChecks).values({
    userId,
    sessionId: null,
    recordedAt: todayIso(),
    sleepHours: input.sleepHours,
    sleepQuality: input.sleepQuality,
    fatigue: input.fatigue,
    stress: input.stress,
    motivation: input.motivation,
    soreness: input.soreness,
    symptom: input.symptom,
    symptomText: input.symptomText,
    illness: input.illness,
  });
}
