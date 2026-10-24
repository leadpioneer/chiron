import { expect, test } from "@playwright/test";
import { createDb, getNextSession, onboard } from "./helpers";

test.describe("safety", () => {
  test("stops the session on a red flag from quick text", async ({ page }) => {
    const sql = createDb();
    try {
      const { cycleId } = await onboard(page, { sql });
      const next = await getNextSession(sql, cycleId);
      await page.getByRole("button", { name: "Начать тренировку" }).click();
      await expect(page).toHaveURL(new RegExp(`/sessions/${next!.id}`));

      const quick = page.getByPlaceholder(
        "Например: жим 60 на 8, RIR 2; ещё 8 и 7",
      );
      await quick.fill("болит в груди, давит");
      await page.getByRole("button", { name: "Разобрать" }).click();

      await expect(
        page.getByText("Тренировка остановлена.", { exact: false }),
      ).toBeVisible();
      await expect(page.getByText(/неотложной/i)).toBeVisible();
    } finally {
      await sql.end();
    }
  });
});
