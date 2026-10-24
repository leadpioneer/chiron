import { expect, test } from "@playwright/test";
import { createDb, onboard } from "./helpers";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

for (const viewport of VIEWPORTS) {
  test(`weekly check-in is usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const { userId } = await onboard(page, { sql });
      await page.setViewportSize(viewport);
      await page.goto("/today");

      const sleepField = page.locator(".field").filter({ hasText: "Качество сна" });
      await sleepField.scrollIntoViewIfNeeded();
      const chip = sleepField.getByRole("button", { name: "5", exact: true });
      const nav = page.locator(".bottom-nav");
      await expect(nav).toBeVisible();
      const chipBox = await chip.boundingBox();
      const navBox = await nav.boundingBox();
      expect(chipBox).toBeTruthy();
      expect(navBox).toBeTruthy();
      expect(chipBox!.y + chipBox!.height).toBeLessThan(navBox!.y);
      await chip.click();
      await expect(chip).toHaveClass(/active/);

      await page
        .locator(".field")
        .filter({ hasText: "Стресс" })
        .getByRole("button", { name: "2", exact: true })
        .click();
      await page
        .locator(".field")
        .filter({ hasText: "Мотивация" })
        .getByRole("button", { name: "4", exact: true })
        .click();
      await page
        .locator(".field")
        .filter({ hasText: "Болезненность" })
        .getByRole("button", { name: "нет", exact: true })
        .click();

      const save = page.getByRole("button", { name: "Сохранить чек-ин" });
      await save.scrollIntoViewIfNeeded();
      const saveBox = await save.boundingBox();
      const navBoxAfter = await nav.boundingBox();
      expect(saveBox).toBeTruthy();
      expect(navBoxAfter).toBeTruthy();
      expect(saveBox!.y + saveBox!.height).toBeLessThan(navBoxAfter!.y);

      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/wellness") &&
          response.request().method() === "POST",
      );
      await save.click();
      expect((await responsePromise).ok()).toBeTruthy();

      const wellness = await sql`
        select count(*)::int as n from wellness_checks where user_id = ${userId}
      `;
      expect(wellness[0]?.n).toBe(1);
    } finally {
      await sql.end();
    }
  });
}
