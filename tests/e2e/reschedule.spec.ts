import { expect, test } from "@playwright/test";
import {
  addDaysIso,
  createDb,
  getActiveCycle,
  getFollowingSession,
  getNextSession,
  onboard,
  startSession,
} from "./helpers";

test.describe("session reschedule", () => {
  test("moves a single session, then shifts the tail on order conflict", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId, userId } = await onboard(page, { sql });
      const cycle = await getActiveCycle(sql, userId);
      expect(cycle).toBeTruthy();
      const first = await getNextSession(sql, cycleId);
      const second = await getFollowingSession(sql, cycleId, first!.sessionIndex);
      expect(first).toBeTruthy();
      expect(second).toBeTruthy();

      const singleDate = addDaysIso(first!.plannedDate, 1);
      await page.getByRole("button", { name: "Отложить" }).click();
      await page.locator('input[type="date"]').fill(singleDate);
      const singleResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/sessions/${first!.id}/reschedule`) &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Перенести", exact: true }).click();
      expect((await singleResponse).ok()).toBeTruthy();
      await page.waitForLoadState("load");

      const moved = await sql`
        select planned_date::text as "plannedDate"
        from sessions where id = ${first!.id}
      `;
      expect(moved[0]?.plannedDate).toBe(singleDate);

      const conflictDate = second!.plannedDate;
      await page.getByRole("button", { name: "Отложить" }).click();
      await page.locator('input[type="date"]').fill(conflictDate);
      const conflictResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/sessions/${first!.id}/reschedule`) &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Перенести", exact: true }).click();
      expect((await conflictResponse).status()).toBe(409);
      await expect(
        page.getByText(/пересекается со следующей/).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Сдвинуть оставшиеся" }),
      ).toBeVisible();

      const shiftResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/sessions/${first!.id}/reschedule`) &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Сдвинуть оставшиеся" })
        .click();
      expect((await shiftResponse).ok()).toBeTruthy();
      await page.waitForLoadState("load");

      const shifted = await sql`
        select id, planned_date::text as "plannedDate"
        from sessions
        where cycle_id = ${cycleId} and session_index <= ${second!.sessionIndex}
        order by session_index
      `;
      expect(shifted[0]?.plannedDate).toBe(addDaysIso(singleDate, 1));
      expect(shifted[1]?.plannedDate).toBe(addDaysIso(conflictDate, 1));

      const cycleAfter = await getActiveCycle(sql, userId);
      expect(cycleAfter?.endDate).toBe(addDaysIso(cycle!.endDate, 1));
      const versions = await sql`
        select count(*)::int as n from plan_versions where cycle_id = ${cycleId}
      `;
      expect(versions[0]?.n).toBe(1);

      const audit = await sql`
        select payload
        from audit_events
        where event_type = 'SESSION_RESCHEDULED' and entity_id = ${first!.id}
        order by created_at
      `;
      expect(audit).toHaveLength(2);
      expect(audit[0]?.payload.mode).toBe("SINGLE");
      expect(audit[1]?.payload.mode).toBe("SHIFT_TAIL");

      await page.goto("/history");
      await expect(page.getByText("Тренировка перенесена").first()).toBeVisible();
      await expect(page.getByText(/→/).first()).toBeVisible();

      const tooLate = addDaysIso(cycleAfter!.endDate, 15);
      const beyond = await page.request.post(
        `/api/sessions/${first!.id}/reschedule`,
        { data: { newDate: tooLate, mode: "SHIFT_TAIL" } },
      );
      expect(beyond.status()).toBe(422);
      expect((await beyond.json()).code).toBe("DATE_BEYOND_CYCLE");

      await startSession(page, first!.id);
      const notPlanned = await page.request.post(
        `/api/sessions/${first!.id}/reschedule`,
        { data: { newDate: addDaysIso(singleDate, 2), mode: "SINGLE" } },
      );
      expect(notPlanned.status()).toBe(409);
      expect((await notPlanned.json()).code).toBe("NOT_PLANNED");
    } finally {
      await sql.end();
    }
  });
});
