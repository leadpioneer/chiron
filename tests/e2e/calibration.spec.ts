import { expect, test } from "@playwright/test";
import {
  createDb,
  getNextSession,
  getPrescriptionLoads,
  onboard,
} from "./helpers";

test.describe("accessory calibration", () => {
  test("shows the calibration hint and uses the entered weight as the baseline", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, { sql });
      const first = await getNextSession(sql, cycleId);
      expect(first).toBeTruthy();

      const planCard = page
        .locator(".exercise")
        .filter({ hasText: "Горизонтальная тяга" })
        .first();
      await expect(planCard).toContainText(
        "Калибровка: введите рабочий вес",
      );

      await page.getByRole("button", { name: "Начать тренировку" }).click();
      await expect(page).toHaveURL(new RegExp(`/sessions/${first!.id}`));

      const exercise = page
        .locator(".exercise")
        .filter({ hasText: "Горизонтальная тяга" })
        .first();
      await expect(exercise).toContainText(
        "Калибровка: введите рабочий вес",
      );
      const setRow = exercise.locator(".set-row").first();
      await setRow.getByLabel("Вес", { exact: true }).fill("40");
      await setRow.getByLabel("Повторы", { exact: true }).fill("12");
      await setRow.getByRole("button", { name: "Готово" }).click();
      await expect(
        setRow.getByRole("button", { name: "Обновить" }),
      ).toBeVisible();

      await page
        .locator(".card")
        .filter({ hasText: "Завершить тренировку" })
        .getByRole("button", { name: "Завершить", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Завершить и получить предложения" })
        .click();
      await expect(page).toHaveURL(/\/recommendations/);

      const calibrationCard = page
        .locator("article.card")
        .filter({ hasText: "Горизонтальная тяга" })
        .filter({ hasText: "калибровка" })
        .first();
      await expect(calibrationCard).toBeVisible();
      const decisionResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/decision") &&
          response.request().method() === "POST",
      );
      await calibrationCard
        .getByRole("button", { name: "Подтвердить" })
        .click();
      expect((await decisionResponse).ok()).toBeTruthy();

      const nextA = await sql`
        select id from sessions
        where cycle_id = ${cycleId} and session_index = 2
      `;
      const loads = await getPrescriptionLoads(sql, nextA[0]!.id);
      const row = loads.find(
        (item) => item.exerciseName === "Горизонтальная тяга",
      );
      expect(row?.weightKg).toBe(40);
    } finally {
      await sql.end();
    }
  });

  test("does not block completion without any sets", async ({ page }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, { sql });
      const first = await getNextSession(sql, cycleId);
      await page.getByRole("button", { name: "Начать тренировку" }).click();
      await expect(page).toHaveURL(new RegExp(`/sessions/${first!.id}`));

      await page
        .locator(".card")
        .filter({ hasText: "Завершить тренировку" })
        .getByRole("button", { name: "Завершить", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Завершить и получить предложения" })
        .click();
      await expect(page).toHaveURL(/\/recommendations/);
      await expect(page.locator(".error")).toHaveCount(0);
    } finally {
      await sql.end();
    }
  });
});
