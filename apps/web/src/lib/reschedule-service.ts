import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import type { RescheduleMode, SessionStatus } from "@chiron/contracts";
import {
  addDays,
  isIsoDate,
  planReschedule,
  type RescheduleErrorCode,
} from "@chiron/core";
import {
  auditEvents,
  getDb,
  sessions,
  trainingCycles,
} from "@chiron/db";
import { todayIso } from "./dates";

const STATUS_BY_CODE: Record<RescheduleErrorCode, number> = {
  NOT_PLANNED: 409,
  ORDER_CONFLICT: 409,
  EXTENSION_LIMIT: 409,
  DATE_IN_PAST: 422,
  DATE_BEYOND_CYCLE: 422,
  END_BEFORE_START: 422,
};

export class RescheduleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "RescheduleError";
  }
}

export interface RescheduleResult {
  sessionId: string;
  newDate: string;
  mode: RescheduleMode;
  deltaDays: number;
  endDateBefore: string;
  endDateAfter: string;
  movedSessions: number;
}

export async function rescheduleSession(
  userId: string,
  sessionId: string,
  input: { newDate: string; mode: RescheduleMode },
  options: { today?: string } = {},
): Promise<RescheduleResult> {
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
      throw new RescheduleError(
        "NOT_FOUND",
        "Тренировка не найдена",
        404,
      );
    }
    if (row.cycle.status !== "ACTIVE") {
      throw new RescheduleError(
        "CYCLE_CLOSED",
        "Цикл закрыт; перенос недоступен",
        409,
      );
    }

    const nextRows = await tx
      .select({ plannedDate: sessions.plannedDate })
      .from(sessions)
      .where(
        and(
          eq(sessions.cycleId, row.cycle.id),
          eq(sessions.status, "PLANNED"),
          gt(sessions.sessionIndex, row.session.sessionIndex),
        ),
      )
      .orderBy(asc(sessions.sessionIndex))
      .limit(1);

    const plan = planReschedule({
      status: row.session.status as SessionStatus,
      mode: input.mode,
      currentDate: row.session.plannedDate,
      newDate: input.newDate,
      today,
      cycleStartDate: row.cycle.startDate,
      cycleEndDate: row.cycle.endDate,
      nextPlannedDate: nextRows[0]?.plannedDate ?? null,
    });

    if (!plan.ok) {
      throw new RescheduleError(
        plan.code,
        plan.message,
        STATUS_BY_CODE[plan.code] ?? 400,
      );
    }

    let movedSessions = 0;
    const movedSessionIds: string[] = [];
    if (plan.mode === "SINGLE") {
      await tx
        .update(sessions)
        .set({
          plannedDate: input.newDate,
          rescheduledFrom:
            row.session.rescheduledFrom ?? row.session.plannedDate,
        })
        .where(eq(sessions.id, sessionId));
      movedSessions = 1;
      movedSessionIds.push(sessionId);
    } else {
      const tail = await tx
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.cycleId, row.cycle.id),
            eq(sessions.status, "PLANNED"),
            gt(sessions.sessionIndex, row.session.sessionIndex - 1),
          ),
        )
        .orderBy(asc(sessions.sessionIndex))
        .for("update");

      for (const item of tail) {
        await tx
          .update(sessions)
          .set({
            plannedDate: addDays(item.plannedDate, plan.deltaDays),
            rescheduledFrom: item.rescheduledFrom ?? item.plannedDate,
          })
          .where(eq(sessions.id, item.id));
        movedSessionIds.push(item.id);
      }
      movedSessions = tail.length;
    }

    await tx
      .update(trainingCycles)
      .set({ endDate: plan.endDateAfter })
      .where(eq(trainingCycles.id, row.cycle.id));

    await tx.insert(auditEvents).values({
      userId,
      entity: "session",
      entityId: sessionId,
      eventType: "SESSION_RESCHEDULED",
      payload: {
        cycleId: row.cycle.id,
        anchorSessionIndex: row.session.sessionIndex,
        from: row.session.plannedDate,
        to: input.newDate,
        mode: plan.mode,
        deltaDays: plan.deltaDays,
        endDateBefore: plan.endDateBefore,
        endDateAfter: plan.endDateAfter,
        movedSessions,
        movedSessionIds,
      },
      versions: { rules: "1.0.0" },
    });

    return {
      sessionId,
      newDate: input.newDate,
      mode: plan.mode,
      deltaDays: plan.deltaDays,
      endDateBefore: plan.endDateBefore,
      endDateAfter: plan.endDateAfter,
      movedSessions,
    };
  });
}

interface ReschedulePayload {
  from: string;
  to: string;
  mode: RescheduleMode;
  deltaDays: number;
  endDateBefore: string;
  endDateAfter: string;
  movedSessions: number;
  movedSessionIds: string[] | null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseReschedulePayload(value: unknown): ReschedulePayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.from !== "string" ||
    typeof payload.to !== "string" ||
    typeof payload.endDateBefore !== "string" ||
    typeof payload.endDateAfter !== "string" ||
    (payload.mode !== "SINGLE" && payload.mode !== "SHIFT_TAIL") ||
    typeof payload.deltaDays !== "number" ||
    !Number.isInteger(payload.deltaDays) ||
    !isIsoDate(payload.from) ||
    !isIsoDate(payload.to) ||
    !isIsoDate(payload.endDateBefore) ||
    !isIsoDate(payload.endDateAfter)
  ) {
    return null;
  }
  const movedSessionIds = Array.isArray(payload.movedSessionIds)
    ? payload.movedSessionIds.filter(
        (item): item is string => typeof item === "string" && isUuid(item),
      )
    : null;
  return {
    from: payload.from,
    to: payload.to,
    mode: payload.mode as RescheduleMode,
    deltaDays: payload.deltaDays,
    endDateBefore: payload.endDateBefore,
    endDateAfter: payload.endDateAfter,
    movedSessions:
      typeof payload.movedSessions === "number"
        ? payload.movedSessions
        : (movedSessionIds?.length ?? 0),
    movedSessionIds,
  };
}

export interface LatestReschedule {
  sessionId: string;
  from: string;
  to: string;
  mode: RescheduleMode;
  deltaDays: number;
  movedSessions: number;
  createdAt: Date;
  movedSessionIds: string[] | null;
}

export async function getLatestReschedule(
  userId: string,
  cycleId: string,
): Promise<LatestReschedule | null> {
  const db = getDb();
  const events = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, userId),
        eq(auditEvents.entity, "session"),
        inArray(auditEvents.eventType, [
          "SESSION_RESCHEDULED",
          "SESSION_RESCHEDULE_UNDONE",
        ]),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(50);

  for (const event of events) {
    if (!isUuid(event.entityId)) continue;
    const rows = await db
      .select({ cycleId: sessions.cycleId, status: sessions.status })
      .from(sessions)
      .where(eq(sessions.id, event.entityId))
      .limit(1);
    const row = rows[0];
    if (!row || row.cycleId !== cycleId) continue;
    if (event.eventType === "SESSION_RESCHEDULE_UNDONE") return null;
    if (row.status !== "PLANNED") return null;
    const payload = parseReschedulePayload(event.payload);
    if (!payload) continue;
    return {
      sessionId: event.entityId,
      from: payload.from,
      to: payload.to,
      mode: payload.mode,
      deltaDays: payload.deltaDays,
      movedSessions: payload.movedSessions,
      movedSessionIds: payload.movedSessionIds,
      createdAt: event.createdAt,
    };
  }
  return null;
}

export interface UndoRescheduleResult {
  sessionId: string;
  restoredDate: string;
  mode: RescheduleMode;
  deltaDays: number;
  movedSessions: number;
}

export async function undoLastReschedule(
  userId: string,
  sessionId: string,
): Promise<UndoRescheduleResult> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const targetRows = await tx
      .select({ session: sessions, cycle: trainingCycles })
      .from(sessions)
      .innerJoin(trainingCycles, eq(sessions.cycleId, trainingCycles.id))
      .where(
        and(eq(sessions.id, sessionId), eq(trainingCycles.userId, userId)),
      )
      .for("update");
    const target = targetRows[0];
    if (!target) {
      throw new RescheduleError("NOT_FOUND", "Тренировка не найдена", 404);
    }
    if (target.cycle.status !== "ACTIVE") {
      throw new RescheduleError(
        "CYCLE_CLOSED",
        "Цикл закрыт; отмена переноса недоступна",
        409,
      );
    }
    if (target.session.status !== "PLANNED") {
      throw new RescheduleError(
        "NOT_PLANNED",
        "Отменить перенос можно только для запланированной тренировки",
        409,
      );
    }

    const events = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.userId, userId),
          eq(auditEvents.entity, "session"),
          inArray(auditEvents.eventType, [
            "SESSION_RESCHEDULED",
            "SESSION_RESCHEDULE_UNDONE",
          ]),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(50);

    let event: (typeof events)[number] | null = null;
    for (const candidate of events) {
      if (!isUuid(candidate.entityId)) continue;
      const rows = await tx
        .select({ cycleId: sessions.cycleId })
        .from(sessions)
        .where(eq(sessions.id, candidate.entityId))
        .limit(1);
      if (rows[0]?.cycleId === target.cycle.id) {
        event = candidate;
        break;
      }
    }

    if (!event) {
      throw new RescheduleError(
        "NO_RESCHEDULE",
        "Нет переноса, который можно отменить",
        404,
      );
    }
    if (event.eventType === "SESSION_RESCHEDULE_UNDONE") {
      throw new RescheduleError(
        "ALREADY_UNDONE",
        "Последний перенос уже отменён",
        409,
      );
    }
    if (event.entityId !== sessionId) {
      throw new RescheduleError(
        "OTHER_SESSION",
        "Последний перенос относится к другой тренировке",
        409,
      );
    }

    const payload = parseReschedulePayload(event.payload);
    if (!payload) {
      throw new RescheduleError(
        "BAD_PAYLOAD",
        "Не удалось прочитать параметры переноса",
        409,
      );
    }
    if (target.session.plannedDate !== payload.to) {
      throw new RescheduleError(
        "CHANGED_SINCE",
        "После переноса были изменения; отмена недоступна",
        409,
      );
    }
    if (target.cycle.endDate !== payload.endDateAfter) {
      throw new RescheduleError(
        "CHANGED_SINCE",
        "После переноса менялся конец цикла; отмена недоступна",
        409,
      );
    }

    let movedSessionIds: string[];
    if (payload.mode === "SINGLE") {
      movedSessionIds = [sessionId];
    } else if (payload.movedSessionIds) {
      movedSessionIds = payload.movedSessionIds;
      const movedRows = await tx
        .select({ id: sessions.id, cycleId: sessions.cycleId, status: sessions.status })
        .from(sessions)
        .where(inArray(sessions.id, movedSessionIds))
        .for("update");
      if (
        movedRows.length !== movedSessionIds.length ||
        movedRows.some(
          (row) =>
            row.cycleId !== target.cycle.id || row.status !== "PLANNED",
        )
      ) {
        throw new RescheduleError(
          "MOVED_SESSIONS_CHANGED",
          "Нельзя отменить: часть тренировок уже начата, завершена или пропущена",
          409,
        );
      }
    } else {
      const tail = await tx
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.cycleId, target.cycle.id),
            gt(
              sessions.sessionIndex,
              target.session.sessionIndex - 1,
            ),
          ),
        )
        .orderBy(asc(sessions.sessionIndex))
        .for("update");
      if (tail.some((row) => row.status !== "PLANNED")) {
        throw new RescheduleError(
          "MOVED_SESSIONS_CHANGED",
          "Нельзя отменить: часть тренировок уже начата, завершена или пропущена",
          409,
        );
      }
      movedSessionIds = tail.map((row) => row.id);
    }

    if (!movedSessionIds.includes(sessionId)) {
      throw new RescheduleError(
        "BAD_PAYLOAD",
        "Параметры переноса не содержат эту тренировку",
        409,
      );
    }

    for (const movedId of movedSessionIds) {
      const rows = await tx
        .select({ plannedDate: sessions.plannedDate })
        .from(sessions)
        .where(eq(sessions.id, movedId))
        .limit(1);
      const current = rows[0]?.plannedDate;
      if (!current) {
        throw new RescheduleError(
          "MOVED_SESSION_NOT_FOUND",
          "Не удалось найти перенесённую тренировку",
          409,
        );
      }
      await tx
        .update(sessions)
        .set({
          plannedDate: addDays(current, -payload.deltaDays),
          rescheduledFrom: null,
        })
        .where(eq(sessions.id, movedId));
    }

    await tx
      .update(trainingCycles)
      .set({ endDate: payload.endDateBefore })
      .where(eq(trainingCycles.id, target.cycle.id));

    await tx.insert(auditEvents).values({
      userId,
      entity: "session",
      entityId: sessionId,
      eventType: "SESSION_RESCHEDULE_UNDONE",
      payload: {
        cycleId: target.cycle.id,
        from: payload.to,
        to: payload.from,
        mode: payload.mode,
        deltaDays: payload.deltaDays,
        movedSessions: movedSessionIds.length,
        restoredEndDate: payload.endDateBefore,
      },
      versions: { rules: "1.0.0" },
    });

    return {
      sessionId,
      restoredDate: payload.from,
      mode: payload.mode,
      deltaDays: payload.deltaDays,
      movedSessions: movedSessionIds.length,
    };
  });
}
