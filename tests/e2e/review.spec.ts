import { expect, test } from "@playwright/test";
import {
  backdateLastCompleted,
  createDb,
  getActiveCycle,
  getCycleSessions,
  getCycleStatus,
  getNextSession,
  getPrescriptionLoads,
  getSessionPrescriptions,
  onboard,
  saveSetsAndComplete,
} from "./helpers";

test.describe("cycle review", () => {
  test("rebuilds a cycle after 29 days and creates four return sessions", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId, userId } = await onboard(page, { sql });
      const first = await getNextSession(sql, cycleId);
      expect(first).toBeTruthy();
      await saveSetsAndComplete(
        page,
        first!.id,
        await getSessionPrescriptions(sql, first!.id),
      );
      await backdateLastCompleted(sql, userId, 29);

      const oldCycle = await getActiveCycle(sql, userId);
      expect(oldCycle?.id).toBe(cycleId);
      const oldVersion = oldCycle!.currentPlanVersionId!;
      const oldLoads = await getPrescriptionLoads(sql, first!.id);

      await page.goto("/today");
      const review = page.locator("#cycle-review");
      await expect(review).toBeVisible();
      await expect(review).toContainText("Цикл нужно пересмотреть");
      await expect(review).toContainText("пауза 29 дн.");
      await expect(
        page.getByRole("button", { name: "Начать тренировку" }),
      ).toHaveCount(0);

      const reviewResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/cycles/${cycleId}/review`) &&
          response.request().method() === "POST",
      );
      await review.getByRole("button", { name: "Пересобрать цикл" }).click();
      expect((await reviewResponse).ok()).toBeTruthy();
      await expect(page).toHaveURL(/\/today/);
      await expect(page.getByText("Возвращение", { exact: true }).first()).toBeVisible();

      const oldStatus = await getCycleStatus(sql, cycleId);
      expect(oldStatus?.status).toBe("STOPPED");
      expect(oldStatus?.closeReason).toBe("LONG_PAUSE");

      const newCycle = await getActiveCycle(sql, userId);
      expect(newCycle).toBeTruthy();
      expect(newCycle!.id).not.toBe(cycleId);
      expect(newCycle!.returnPhaseSessions).toBe(4);

      const sessions = await getCycleSessions(sql, newCycle!.id);
      expect(sessions).toHaveLength(28);
      expect(sessions.slice(0, 4).every((item) => item.isReturn)).toBe(true);
      expect(sessions.slice(4).some((item) => item.isReturn)).toBe(false);

      const next = await getNextSession(sql, newCycle!.id);
      const newLoads = await getPrescriptionLoads(sql, next!.id);
      for (const item of newLoads) {
        const previous = oldLoads.find(
          (candidate) => candidate.exerciseName === item.exerciseName,
        );
        if (!previous) continue;
        if (item.loadMode === "EXTERNAL" && previous.weightKg !== null) {
          expect(item.weightKg).toBeLessThan(previous.weightKg);
        }
      }

      const oldVariants = await sql`
        select array_agg(distinct exercise_variant_id order by exercise_variant_id) as ids
        from prescriptions where plan_version_id = ${oldVersion}
      `;
      const newVariants = await sql`
        select array_agg(distinct exercise_variant_id order by exercise_variant_id) as ids
        from prescriptions where plan_version_id = ${newCycle!.currentPlanVersionId}
      `;
      expect(newVariants[0]?.ids).toEqual(oldVariants[0]?.ids);

      const repeat = await page.request.post(`/api/cycles/${cycleId}/review`, {
        data: { action: "REBUILD", reason: "LONG_PAUSE" },
      });
      expect(repeat.status()).toBe(409);
      expect((await repeat.json()).code).toBe("CYCLE_NOT_ACTIVE");
    } finally {
      await sql.end();
    }
  });

  test("stops a cycle after a long pause and returns to onboarding", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId, userId } = await onboard(page, { sql });
      const first = await getNextSession(sql, cycleId);
      await saveSetsAndComplete(
        page,
        first!.id,
        await getSessionPrescriptions(sql, first!.id),
      );
      await backdateLastCompleted(sql, userId, 29);
      await page.goto("/today");

      page.once("dialog", (dialog) => dialog.accept());
      const reviewResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/cycles/${cycleId}/review`) &&
          response.request().method() === "POST",
      );
      await page
        .locator("#cycle-review")
        .getByRole("button", { name: "Завершить цикл" })
        .click();
      expect((await reviewResponse).ok()).toBeTruthy();
      await expect(page).toHaveURL(/\/onboarding/);
      await expect(page.getByRole("heading", { name: "Соберём базу" })).toBeVisible();

      const status = await getCycleStatus(sql, cycleId);
      expect(status?.status).toBe("STOPPED");
      expect(status?.closeReason).toBe("LONG_PAUSE");
      expect(await getActiveCycle(sql, userId)).toBeUndefined();
    } finally {
      await sql.end();
    }
  });

  test("opens a manual review from settings", async ({ page }) => {
    const sql = createDb();
    try {
      await onboard(page, { sql });
      await page.goto("/settings");
      await page.getByRole("link", { name: "Пересмотреть цикл" }).click();
      await expect(page).toHaveURL(/\/cycle\/review/);
      await expect(
        page.getByText("ручной пересмотр", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Пересобрать цикл" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Завершить цикл" }),
      ).toBeVisible();
    } finally {
      await sql.end();
    }
  });

  test("blocks training after a red flag and offers a safety review", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, { sql });
      const first = await getNextSession(sql, cycleId);
      const result = await saveSetsAndComplete(page, first!.id, [], {
        saveSets: false,
        sessionRpe: "MODERATE",
        comment: "болит в груди, давит",
      });
      expect(
        result.recommendations.some((item) => item.action === "PAUSE"),
      ).toBe(true);

      const safety = await sql`
        select severity from safety_events where user_id = (
          select user_id from training_cycles where id = ${cycleId}
        ) order by created_at desc limit 1
      `;
      expect(safety[0]?.severity).toBe("RED");

      await page.goto("/today");
      await expect(page.locator("#cycle-review")).toBeVisible();
      await expect(page.getByText("Сигнал безопасности.")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Начать тренировку" }),
      ).toHaveCount(0);
    } finally {
      await sql.end();
    }
  });
});
