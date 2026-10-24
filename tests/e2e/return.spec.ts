import { expect, test } from "@playwright/test";
import {
  backdateLastCompleted,
  createDb,
  getActiveCycle,
  getNextSession,
  getPendingRecommendations,
  getPrescriptionLoads,
  getSessionPrescriptions,
  onboard,
  saveSetsAndComplete,
} from "./helpers";

test.describe("return after a pause", () => {
  test("prepares a one-session return, blocks a repeat, and holds progression", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId, userId } = await onboard(page, { sql });
      const first = await getNextSession(sql, cycleId);
      expect(first).toBeTruthy();
      const firstPrescriptions = await getSessionPrescriptions(sql, first!.id);
      await saveSetsAndComplete(page, first!.id, firstPrescriptions);
      await backdateLastCompleted(sql, userId, 10);

      await page.goto("/today");
      const card = page.locator("#return");
      await expect(
        page.getByRole("heading", { name: "Подготовить возвращение" }),
      ).toBeVisible();
      await expect(card).toContainText("RIR 3");
      await expect(card).toContainText("после паузы 10 дн.");

      const next = await getNextSession(sql, cycleId);
      expect(next).toBeTruthy();
      const before = await getPrescriptionLoads(sql, next!.id);
      const cycleBefore = await getActiveCycle(sql, userId);
      const currentVersionBefore = cycleBefore?.currentPlanVersionId;

      const returnResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/sessions/${next!.id}/return`) &&
          response.request().method() === "POST",
      );
      await card
        .getByRole("button", { name: "Подготовить возвращение" })
        .click();
      expect((await returnResponse).ok()).toBeTruthy();
      await page.waitForLoadState("load");
      await expect(page.getByText("Возвращение", { exact: true }).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Начать тренировку" }),
      ).toBeVisible();

      const cycleAfter = await getActiveCycle(sql, userId);
      expect(cycleAfter?.currentPlanVersionId).toBe(currentVersionBefore);

      const nextRow = await sql`
        select is_return as "isReturn", plan_version_id as "planVersionId"
        from sessions where id = ${next!.id}
      `;
      expect(nextRow[0]?.isReturn).toBe(true);
      expect(nextRow[0]?.planVersionId).not.toBe(currentVersionBefore);

      const after = await getPrescriptionLoads(sql, next!.id);
      expect(after.map((item) => item.exerciseName).sort()).toEqual(
        before.map((item) => item.exerciseName).sort(),
      );
      for (const item of after) {
        expect(item.targetRir, `${item.id} return RIR`).toBe(3);
        const previous = before.find(
          (candidate) => candidate.exerciseName === item.exerciseName,
        );
        if (!previous) continue;
        if (item.loadMode === "EXTERNAL" && previous.weightKg !== null) {
          expect(item.weightKg).toBeLessThan(previous.weightKg);
        }
        if (item.loadMode === "ASSISTED" && previous.assistanceKg !== null) {
          expect(item.assistanceKg).toBeGreaterThan(previous.assistanceKg);
        }
      }

      const repeat = await page.request.post(`/api/sessions/${next!.id}/return`);
      expect(repeat.status()).toBe(409);
      expect((await repeat.json()).code).toBe("ALREADY_RETURN");

      await page.getByRole("button", { name: "Начать тренировку" }).click();
      await expect(page).toHaveURL(new RegExp(`/sessions/${next!.id}`));
      await expect(page.getByText("Возвращение после паузы.")).toBeVisible();
      await expect(page.getByText(/RIR\s*3–4/)).toBeVisible();

      const returnPrescriptions = await getSessionPrescriptions(sql, next!.id);
      await saveSetsAndComplete(page, next!.id, returnPrescriptions, {
        sessionRpe: "MODERATE",
      });

      const pending = await getPendingRecommendations(sql, cycleId, next!.id);
      expect(pending.length).toBeGreaterThan(0);
      expect(pending.every((item) => item.action === "HOLD")).toBe(true);
      expect(
        pending.every((item) => item.ruleIds?.includes("RETURN_PHASE")),
      ).toBe(true);
    } finally {
      await sql.end();
    }
  });

  test("prepares a two-session return with RIR 4 then RIR 3", async ({
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
      await backdateLastCompleted(sql, userId, 15);

      await page.goto("/today");
      const card = page.locator("#return");
      await expect(card).toContainText("RIR 4, затем 3");
      await expect(card).toContainText("2");
      const next = await getNextSession(sql, cycleId);
      expect(next).toBeTruthy();
      const returnResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/sessions/${next!.id}/return`) &&
          response.request().method() === "POST",
      );
      await card
        .getByRole("button", { name: "Подготовить возвращение" })
        .click();
      expect((await returnResponse).ok()).toBeTruthy();
      await page.waitForLoadState("load");
      await expect(page.getByText("Возвращение", { exact: true }).first()).toBeVisible();

      const sessions = await sql`
        select
          session_index as "sessionIndex",
          is_return as "isReturn",
          plan_version_id as "planVersionId"
        from sessions
        where cycle_id = ${cycleId}
        order by session_index
        limit 3
      `;
      expect(sessions[1]?.isReturn).toBe(true);
      expect(sessions[2]?.isReturn).toBe(true);
      expect(sessions[1]?.planVersionId).toBe(sessions[2]?.planVersionId);

      const second = await getNextSession(sql, cycleId);
      const secondLoads = await getPrescriptionLoads(sql, second!.id);
      const rirs = secondLoads.map((item) => item.targetRir);
      expect(rirs.every((rir) => rir === 4)).toBe(true);

      const third = await sql`
        select id from sessions where cycle_id = ${cycleId} and session_index = ${sessions[2]!.sessionIndex}
      `;
      const thirdLoads = await getPrescriptionLoads(sql, third[0]!.id);
      expect(thirdLoads.every((item) => item.targetRir === 3)).toBe(true);

      await saveSetsAndComplete(
        page,
        second!.id,
        await getSessionPrescriptions(sql, second!.id),
      );
      const remaining = await sql`
        select is_return as "isReturn", status
        from sessions where id = ${third[0]!.id}
      `;
      expect(remaining[0]?.isReturn).toBe(true);
      expect(remaining[0]?.status).toBe("PLANNED");
    } finally {
      await sql.end();
    }
  });
});
