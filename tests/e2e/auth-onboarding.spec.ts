import { expect, test } from "@playwright/test";
import {
  createDb,
  getActiveCycle,
  getCycleSessions,
  getUserByEmail,
  login,
  onboard,
  uniqueEmail,
} from "./helpers";

test.describe("auth and onboarding", () => {
  test("magic link opens onboarding", async ({ page }) => {
    const email = uniqueEmail("magic");
    await login(page, email);
    await expect(page.getByRole("heading", { name: "Соберём базу" })).toBeVisible();
    await expect(page.getByText("Первый цикл")).toBeVisible();
  });

  test("every-other-day onboarding creates 28 sessions", async ({ page }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, {
        sql,
        scheme: "EVERY_OTHER_DAY",
      });
      await expect(page.getByText("Неделя 1 из 8")).toBeVisible();
      const sessions = await getCycleSessions(sql, cycleId);
      expect(sessions).toHaveLength(28);
      await expect(
        page.locator(".stat").filter({ hasText: "В плане" }),
      ).toContainText("28");
    } finally {
      await sql.end();
    }
  });

  test("five-day onboarding creates 23 sessions", async ({ page }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, {
        sql,
        scheme: "FIVE_DAY_CYCLE",
      });
      const sessions = await getCycleSessions(sql, cycleId);
      expect(sessions).toHaveLength(23);
      await expect(
        page.locator(".stat").filter({ hasText: "В плане" }),
      ).toContainText("23");
    } finally {
      await sql.end();
    }
  });

  test("onboarding saves the profile and active cycle", async ({ page }) => {
    const sql = createDb();
    try {
      const email = uniqueEmail("profile");
      const { userId } = await onboard(page, { sql, email });
      const user = await getUserByEmail(sql, email);
      expect(user.id).toBe(userId);
      const cycle = await getActiveCycle(sql, userId);
      expect(cycle?.status).toBe("ACTIVE");
      await page.goto("/settings");
      await expect(page.getByText("Через день")).toBeVisible();
      await expect(page.getByText("80 кг")).toBeVisible();
    } finally {
      await sql.end();
    }
  });
});
