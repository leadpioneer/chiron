import { and, eq } from "drizzle-orm";
import type { SetPerformanceInput, WellnessInput } from "@chiron/contracts";
import {
  auditEvents,
  getDb,
  sessions,
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
  options: { today?: string } = {},
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
      entity: "session",
      entityId: sessionId,
      eventType: "SESSION_STARTED",
      payload: { sessionIndex: view.session.sessionIndex },
      versions: { rules: "1.0.0" },
    });
  }
}

export async function upsertSet(
  userId: string,
  sessionId: string,
  input: SetPerformanceInput,
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

export async function saveWellness(
  userId: string,
  sessionId: string,
  input: WellnessInput,
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
