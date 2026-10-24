import { expect, test } from "@playwright/test";
import { createDb, getNextSession, onboard } from "./helpers";

test.describe("account data", () => {
  test("exports all training data", async ({ page }) => {
    const sql = createDb();
    try {
      const { userId } = await onboard(page, { sql });
      const response = await page.request.get("/api/account/export");
      expect(response.status()).toBe(200);
      expect(response.headers()["content-disposition"]).toContain("attachment");
      const body = (await response.json()) as {
        user: { id: string };
        cycles: unknown[];
        planVersions: unknown[];
        sessions: unknown[];
        auditEvents: unknown[];
      };
      expect(body.user.id).toBe(userId);
      expect(body.cycles.length).toBeGreaterThan(0);
      expect(body.planVersions.length).toBeGreaterThan(0);
      expect(body.sessions.length).toBeGreaterThan(0);
      expect(body.auditEvents.length).toBeGreaterThan(0);
    } finally {
      await sql.end();
    }
  });

  test("soft-deletes the account and revokes access", async ({ page }) => {
    const sql = createDb();
    try {
      const { userId, cycleId } = await onboard(page, { sql });
      await getNextSession(sql, cycleId);
      const response = await page.request.delete("/api/account");
      expect(response.status()).toBe(200);

      const exportAfter = await page.request.get("/api/account/export");
      expect(exportAfter.status()).toBe(401);

      const rows = await sql`
        select email, display_name as "displayName", deleted_at as "deletedAt"
        from users where id = ${userId}
      `;
      expect(rows[0]?.email).toContain("deleted-");
      expect(rows[0]?.deletedAt).not.toBeNull();
      const identities = await sql`
        select count(*)::int as n from identities where user_id = ${userId}
      `;
      expect(identities[0]?.n).toBe(0);

      await page.goto("/today");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await sql.end();
    }
  });
});
