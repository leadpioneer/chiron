import { expect, test } from "@playwright/test";
import {
  addDaysIso,
  applyRecommendation,
  createDb,
  getActiveCycle,
  getFollowingSession,
  getNextSession,
  getSessionPrescriptions,
  onboard,
  saveSetsAndComplete,
} from "./helpers";

test.describe("user control and corrections", () => {
  test("undoes the last single reschedule and the last tail shift", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { userId, cycleId } = await onboard(page, { sql });
      const cycle = await getActiveCycle(sql, userId);
      const first = await getNextSession(sql, cycleId);
      const second = await getFollowingSession(sql, cycleId, first!.sessionIndex);
      expect(cycle).toBeTruthy();
      expect(first).toBeTruthy();
      expect(second).toBeTruthy();

      const singleDate = addDaysIso(first!.plannedDate, 1);
      const single = await page.request.post(
        `/api/sessions/${first!.id}/reschedule`,
        { data: { newDate: singleDate, mode: "SINGLE" } },
      );
      expect(single.ok()).toBeTruthy();

      await page.goto("/today");
      await expect(
        page.getByRole("button", { name: "Отменить перенос" }),
      ).toBeVisible();
      page.on("dialog", (dialog) => dialog.accept());
      const singleUndo = page.waitForResponse(
        (response) =>
          response.url().includes(`/sessions/${first!.id}/reschedule/undo`) &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Отменить перенос" }).click();
      expect((await singleUndo).ok()).toBeTruthy();
      await expect(
        page.getByRole("button", { name: "Отменить перенос" }),
      ).toHaveCount(0);

      const afterSingle = await sql`
        select planned_date::text as "plannedDate" from sessions
        where id = ${first!.id}
      `;
      expect(afterSingle[0]?.plannedDate).toBe(first!.plannedDate);

      const shiftDelta = 2;
      const shiftDate = addDaysIso(first!.plannedDate, shiftDelta);
      const shift = await page.request.post(
        `/api/sessions/${first!.id}/reschedule`,
        { data: { newDate: shiftDate, mode: "SHIFT_TAIL" } },
      );
      expect(shift.ok()).toBeTruthy();

      await page.goto("/today");
      await expect(
        page.getByRole("button", { name: "Отменить перенос" }),
      ).toBeVisible();
      const shiftUndo = page.waitForResponse(
        (response) =>
          response.url().includes(`/sessions/${first!.id}/reschedule/undo`) &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Отменить перенос" }).click();
      expect((await shiftUndo).ok()).toBeTruthy();
      await expect(
        page.getByRole("button", { name: "Отменить перенос" }),
      ).toHaveCount(0);

      const afterShift = await sql`
        select id, planned_date::text as "plannedDate"
        from sessions
        where cycle_id = ${cycleId} and session_index <= ${second!.sessionIndex}
        order by session_index
      `;
      expect(afterShift[0]?.plannedDate).toBe(first!.plannedDate);
      expect(afterShift[1]?.plannedDate).toBe(second!.plannedDate);

      const cycleAfter = await getActiveCycle(sql, userId);
      expect(cycleAfter?.endDate).toBe(cycle!.endDate);

      const undoAudit = await sql`
        select count(*)::int as n from audit_events
        where event_type = 'SESSION_RESCHEDULE_UNDONE'
          and entity_id = ${first!.id}
      `;
      expect(undoAudit[0]?.n).toBe(2);
    } finally {
      await sql.end();
    }
  });

  test("records a workout with a past actual date and rejects a future date", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, { sql });
      await sql`
        update training_cycles
        set start_date = current_date - 7
        where id = ${cycleId}
      `;
      const todayRows = await sql`select current_date::text as today`;
      const today = todayRows[0]!.today as string;
      const yesterday = addDaysIso(today, -1);

      const first = await getNextSession(sql, cycleId);
      const prescriptions = await getSessionPrescriptions(sql, first!.id);
      await saveSetsAndComplete(page, first!.id, prescriptions, {
        actualDate: yesterday,
      });

      const stored = await sql`
        select actual_date::text as "actualDate", status
        from sessions where id = ${first!.id}
      `;
      expect(stored[0]?.actualDate).toBe(yesterday);
      expect(stored[0]?.status).toBe("COMPLETED");

      const second = await getNextSession(sql, cycleId);
      const future = await page.request.post(
        `/api/sessions/${second!.id}/complete`,
        {
          data: {
            sessionRpe: "MODERATE",
            actualDate: addDaysIso(today, 1),
          },
        },
      );
      expect(future.status()).toBe(400);
      expect((await future.json()).code).toBe("DATE_IN_FUTURE");
      const untouched = await sql`
        select status from sessions where id = ${second!.id}
      `;
      expect(untouched[0]?.status).not.toBe("COMPLETED");
    } finally {
      await sql.end();
    }
  });

  test("reopens a completed session, deletes a set, and blocks reopen after a decision", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, { sql });
      const first = await getNextSession(sql, cycleId);
      const prescriptions = await getSessionPrescriptions(sql, first!.id);
      const completed = await saveSetsAndComplete(page, first!.id, prescriptions);
      expect(completed.recommendations.length).toBeGreaterThan(0);

      const completedAt = await sql`
        select actual_date::text as "actualDate"
        from sessions where id = ${first!.id}
      `;
      expect(completedAt[0]?.actualDate).toBeTruthy();

      await page.goto(`/sessions/${first!.id}`);
      await expect(
        page.getByRole("button", { name: "Исправить запись" }),
      ).toBeVisible();
      page.on("dialog", (dialog) => dialog.accept());
      const reopenResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/sessions/${first!.id}/reopen`) &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Исправить запись" }).click();
      expect((await reopenResponse).ok()).toBeTruthy();
      await page.waitForLoadState("load");

      const reopened = await sql`
        select status, actual_date::text as "actualDate"
        from sessions where id = ${first!.id}
      `;
      expect(reopened[0]?.status).toBe("IN_PROGRESS");
      expect(reopened[0]?.actualDate).toBe(completedAt[0]?.actualDate);

      const setRows = await sql`
        select client_set_id::text as id from set_performances
        where session_id = ${first!.id}
        limit 1
      `;
      expect(setRows[0]?.id).toBeTruthy();
      const deleted = await page.request.delete(
        `/api/sessions/${first!.id}/sets?clientSetId=${setRows[0]!.id}`,
      );
      expect(deleted.ok()).toBeTruthy();
      const remaining = await sql`
        select count(*)::int as n from set_performances
        where session_id = ${first!.id}
      `;
      expect(remaining[0]?.n).toBe(
        prescriptions.reduce((sum, item) => sum + item.sets, 0) - 1,
      );

      const recommitted = await page.request.post(
        `/api/sessions/${first!.id}/complete`,
        { data: { sessionRpe: "MODERATE" } },
      );
      expect(recommitted.ok()).toBeTruthy();
      const body = (await recommitted.json()) as {
        recommendations: Array<{ id: string; action: string }>;
      };
      expect(body.recommendations.length).toBeGreaterThan(0);
      await applyRecommendation(page, body.recommendations[0]!.id);

      const blocked = await page.request.post(
        `/api/sessions/${first!.id}/reopen`,
      );
      expect(blocked.status()).toBe(409);
      expect((await blocked.json()).code).toBe("DECISION_EXISTS");
    } finally {
      await sql.end();
    }
  });
});
