import { expect, test } from "@playwright/test";
import {
  createDb,
  getActiveCycle,
  getNextSession,
  getSessionPrescriptions,
  onboard,
  onboardingInput,
  saveSetsAndComplete,
} from "./helpers";

test.describe("coach mode", () => {
  test("creates a mentee, fills the diary, records the actor, and returns to self", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const coach = await onboard(page, { sql });
      const create = await page.request.post("/api/mentees", {
        data: { displayName: "Даша" },
      });
      expect(create.ok()).toBeTruthy();
      const created = (await create.json()) as {
        mentee: { id: string; displayName: string };
      };
      const menteeId = created.mentee.id;
      expect(created.mentee.displayName).toBe("Даша");

      const onboarding = await page.request.post("/api/onboarding", {
        data: {
          ...onboardingInput("EVERY_OTHER_DAY"),
          displayName: "Даша",
        },
      });
      expect(onboarding.status(), "mentee onboarding succeeds").toBe(200);

      const menteeCycle = await getActiveCycle(sql, menteeId);
      expect(menteeCycle).toBeTruthy();
      const coachCycle = await getActiveCycle(sql, coach.userId);
      expect(coachCycle?.id).toBe(coach.cycleId);

      await page.goto("/mentees");
      await expect(
        page.getByRole("heading", { name: "Подопечные" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Даша" }),
      ).toBeVisible();

      await page.goto("/today");
      await expect(page.getByText("Дневник Даша")).toBeVisible();
      await expect(page.getByText("вы действуете как тренер")).toBeVisible();

      const first = await getNextSession(sql, menteeCycle!.id);
      const prescriptions = await getSessionPrescriptions(sql, first!.id);
      await saveSetsAndComplete(page, first!.id, prescriptions);

      const audit = await sql`
        select actor_user_id::text as "actorUserId"
        from audit_events
        where user_id = ${menteeId}
          and event_type = 'SESSION_COMPLETED'
        order by created_at desc
        limit 1
      `;
      expect(audit[0]?.actorUserId).toBe(coach.userId);

      const session = await sql`
        select status from sessions where id = ${first!.id}
      `;
      expect(session[0]?.status).toBe("COMPLETED");

      await page.request.post("/api/subject", {
        data: { menteeUserId: "" },
      });
      await page.goto("/today");
      await expect(page.getByText("Дневник Даша")).toHaveCount(0);

      const denied = await page.request.post(
        `/api/sessions/${first!.id}/start`,
      );
      expect(denied.status()).toBe(404);
    } finally {
      await sql.end();
    }
  });

  test("pre-links Telegram and keeps the managed profile after revocation", async ({
    page,
  }) => {
    const sql = createDb();
    try {
      const coach = await onboard(page, { sql });
      const telegramId = "999000111";
      const create = await page.request.post("/api/mentees", {
        data: { displayName: "Даша", telegramId },
      });
      expect(create.ok()).toBeTruthy();
      const created = (await create.json()) as {
        mentee: { id: string };
      };

      const linked = await sql`
        select provider, provider_user_id::text as "providerUserId"
        from identities
        where user_id = ${created.mentee.id}
      `;
      expect(linked[0]?.provider).toBe("telegram");
      expect(linked[0]?.providerUserId).toBe(telegramId);

      const list = await page.request.get("/api/mentees");
      const body = (await list.json()) as {
        mentees: Array<{ id: string; hasLogin: boolean }>;
      };
      expect(body.mentees).toHaveLength(1);
      expect(body.mentees[0]?.hasLogin).toBe(true);

      const revoke = await page.request.post(
        `/api/mentees/${created.mentee.id}/revoke`,
      );
      expect(revoke.ok()).toBeTruthy();
      const relation = await sql`
        select status from coach_mentees
        where coach_user_id = ${coach.userId}
          and mentee_user_id = ${created.mentee.id}
      `;
      expect(relation[0]?.status).toBe("REVOKED");

      await page.goto("/today");
      await expect(page.getByText("Дневник Даша")).toHaveCount(0);
      const mentees = await page.request.get("/api/mentees");
      const after = (await mentees.json()) as { mentees: unknown[] };
      expect(after.mentees).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });

  test("rejects an invalid subject cookie", async ({ page }) => {
    const sql = createDb();
    try {
      await onboard(page, { sql });
      await page.context().addCookies([
        {
          name: "chiron_subject",
          value: "11111111-1111-4111-8111-111111111111",
          url: "http://localhost:3100",
        },
      ]);
      await page.goto("/today");
      await expect(page).toHaveURL(/\/mentees\?error=access/);
      await expect(page.getByText("Нет доступа к этому дневнику.")).toBeVisible();
    } finally {
      await sql.end();
    }
  });
});
