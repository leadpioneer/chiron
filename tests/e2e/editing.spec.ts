import { expect, test } from "@playwright/test";
import {
  createDb,
  getNextSession,
  getPrescriptionLoads,
  getSessionPrescriptions,
  onboard,
  saveSetsAndComplete,
  type PrescriptionRow,
} from "./helpers";

test.describe("recommendation editing", () => {
  test("edits a recommended load and applies it to the next session", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, { sql });
      const first = await getNextSession(sql, cycleId);
      const prescriptions = await getSessionPrescriptions(sql, first!.id);
      await saveSetsAndComplete(page, first!.id, prescriptions);

      await page.goto("/recommendations");
      const card = page
        .locator("article.card")
        .filter({ hasText: "Румынская тяга" })
        .first();
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: "Изменить" }).click();
      await card.getByLabel("Нагрузка").fill("102.5");

      const decisionResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/decision") &&
          response.request().method() === "POST",
      );
      await card.getByRole("button", { name: "Подтвердить" }).click();
      expect((await decisionResponse).ok()).toBeTruthy();

      const nextA = await sql`
        select id from sessions
        where cycle_id = ${cycleId} and session_index = 2
      `;
      const loads = await getPrescriptionLoads(sql, nextA[0]!.id);
      const rdl = loads.find((item) => item.exerciseName === "Румынская тяга");
      expect(rdl?.weightKg).toBe(102.5);

      const edited = await sql`
        select outcome from decisions
        where user_id = (
          select user_id from training_cycles where id = ${cycleId}
        )
        order by created_at desc
        limit 1
      `;
      expect(edited[0]?.outcome).toBe("EDITED");
    } finally {
      await sql.end();
    }
  });

  test("accepts a deload partially and leaves the unselected exercise untouched", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, { sql });
      const first = await getNextSession(sql, cycleId);
      const firstPrescriptions = await getSessionPrescriptions(sql, first!.id);
      await saveSetsAndComplete(page, first!.id, firstPrescriptions, {
        reps: (prescription: PrescriptionRow) =>
          Math.max(1, prescription.repMin - 1),
      });

      const second = await getNextSession(sql, cycleId);
      expect(second).toBeTruthy();
      const skip = await page.request.post(`/api/sessions/${second!.id}/skip`, {
        data: { reason: "NO_TIME" },
      });
      expect(skip.ok()).toBeTruthy();

      const third = await getNextSession(sql, cycleId);
      expect(third).toBeTruthy();
      const thirdPrescriptions = await getSessionPrescriptions(sql, third!.id);
      const result = await saveSetsAndComplete(
        page,
        third!.id,
        thirdPrescriptions,
        {
          reps: (prescription: PrescriptionRow) =>
            Math.max(1, prescription.repMin - 2),
          sessionRpe: "MAX",
        },
      );
      const deload = result.recommendations.find(
        (item) => item.action === "DELOAD",
      );
      expect(deload, "deload is proposed").toBeTruthy();

      const nextA = await sql`
        select id from sessions
        where cycle_id = ${cycleId} and session_index = 4
      `;
      const before = await getPrescriptionLoads(sql, nextA[0]!.id);
      const beforeRdl = before.find(
        (item) => item.exerciseName === "Румынская тяга",
      );
      const beforePull = before.find(
        (item) => item.exerciseName === "Подтягивания",
      );
      expect(beforeRdl).toBeTruthy();
      expect(beforePull).toBeTruthy();

      await page.goto("/recommendations");
      const card = page
        .locator("article.card")
        .filter({ hasText: "Разгрузка" })
        .first();
      await expect(card).toBeVisible();
      const items = card.locator(".exercise");
      await expect(items).toHaveCount(2);
      const checkboxes = card.locator('input[type="checkbox"]');
      await expect(checkboxes).toHaveCount(2);
      await checkboxes.nth(1).uncheck();

      const decisionResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/decision") &&
          response.request().method() === "POST",
      );
      await card.getByRole("button", { name: "Подтвердить" }).click();
      expect((await decisionResponse).ok()).toBeTruthy();

      const after = await getPrescriptionLoads(sql, nextA[0]!.id);
      const afterRdl = after.find(
        (item) => item.exerciseName === "Румынская тяга",
      );
      const afterPull = after.find(
        (item) => item.exerciseName === "Подтягивания",
      );
      expect(afterRdl?.weightKg).toBe(beforeRdl!.weightKg);
      expect(afterRdl?.sets).toBe(beforeRdl!.sets);
      expect(afterRdl?.targetReps).toBe(beforeRdl!.targetReps);
      expect(
        afterPull?.sets !== beforePull!.sets ||
          afterPull?.targetReps !== beforePull!.targetReps ||
          afterPull?.assistanceKg !== beforePull!.assistanceKg,
        "the selected primary changed",
      ).toBe(true);
    } finally {
      await sql.end();
    }
  });
});
