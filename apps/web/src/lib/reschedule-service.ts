import { and, asc, eq, gt } from "drizzle-orm";
import type { RescheduleMode, SessionStatus } from "@chiron/contracts";
import {
  addDays,
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
        from: row.session.plannedDate,
        to: input.newDate,
        mode: plan.mode,
        deltaDays: plan.deltaDays,
        endDateBefore: plan.endDateBefore,
        endDateAfter: plan.endDateAfter,
        movedSessions,
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
