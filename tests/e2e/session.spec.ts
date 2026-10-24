import { expect, test } from "@playwright/test";
import {
  createDb,
  getNextSession,
  getSessionPrescriptions,
  onboard,
  saveSetsAndComplete,
} from "./helpers";

test.describe("session and recommendation", () => {
  test("logs a set in the UI and confirms a recommendation", async ({ page }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, { sql });
      const next = await getNextSession(sql, cycleId);
      expect(next).toBeTruthy();

      await page.getByRole("button", { name: "Начать тренировку" }).click();
      await expect(page).toHaveURL(new RegExp(`/sessions/${next!.id}`));
      await expect(page.getByText("Тренировка", { exact: true })).toBeVisible();

      const firstRow = page.locator(".set-row").first();
      await firstRow.getByRole("button", { name: "Готово" }).click();
      await expect(
        firstRow.getByRole("button", { name: "Обновить" }),
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
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: "Предложения" })).toBeVisible();
      const firstCard = page.locator("article.card").first();
      await expect(firstCard).toBeVisible();
      const confirmButtons = page.getByRole("button", { name: "Подтвердить" });
      const before = await confirmButtons.count();
      const decisionResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/decision") &&
          response.request().method() === "POST",
      );
      await firstCard.getByRole("button", { name: "Подтвердить" }).click();
      const response = await decisionResponse;
      expect(response.ok(), "decision is accepted").toBeTruthy();
      await expect(confirmButtons).toHaveCount(before - 1);
      await expect(page.locator(".error")).toHaveCount(0);
    } finally {
      await sql.end();
    }
  });

  test("completes a session through the API and exposes its recommendation", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, { sql });
      const next = await getNextSession(sql, cycleId);
      expect(next).toBeTruthy();
      const prescriptions = await getSessionPrescriptions(sql, next!.id);
      const result = await saveSetsAndComplete(page, next!.id, prescriptions, {
        sessionRpe: "MODERATE",
      });
      expect(result.recommendations.length).toBeGreaterThan(0);
      await page.goto("/recommendations");
      await expect(page.getByRole("heading", { name: "Предложения" })).toBeVisible();
      await expect(page.locator("article.card").first()).toBeVisible();
    } finally {
      await sql.end();
    }
  });
});
