import { expect, test } from "@playwright/test";
import { createDb, getNextSession, onboard } from "./helpers";

test("replaces primary and aesthetic exercises with new plan versions", async ({
  page,
}) => {
  const sql = createDb();
  try {
    const { cycleId, userId } = await onboard(page, { sql });
    const session = await getNextSession(sql, cycleId);
    expect(session).toBeTruthy();
    await page.goto(`/sessions/${session!.id}`);

    const rdlRow = page
      .locator(".exercise")
      .filter({ hasText: "Румынская тяга" })
      .first();
    await expect(rdlRow).toBeVisible();
    await rdlRow.getByRole("button", { name: "Заменить" }).click();

    const primaryDialog = page.getByRole("dialog", {
      name: "Заменить упражнение",
    });
    await expect(primaryDialog).toBeVisible();
    await primaryDialog
      .getByRole("combobox")
      .selectOption({ label: "Румынская тяга с гантелями" });
    await primaryDialog
      .getByRole("button", { name: "Заменить" })
      .click();
    await expect(page.getByText("Румынская тяга с гантелями")).toBeVisible();

    const bicepsRow = page
      .locator(".exercise")
      .filter({ hasText: "Бицепс" })
      .first();
    await bicepsRow.getByRole("button", { name: "Заменить" }).click();
    const aestheticDialog = page.getByRole("dialog", {
      name: "Заменить упражнение",
    });
    await aestheticDialog
      .getByRole("combobox")
      .selectOption({ label: "Махи в стороны" });
    await aestheticDialog
      .getByRole("button", { name: "Заменить" })
      .click();
    await expect(page.getByText("Средняя дельта")).toBeVisible();

    const versions = await sql`
      select id, version, parent_version_id as "parentVersionId", decision_id as "decisionId"
      from plan_versions
      where cycle_id = ${cycleId}
      order by version
    `;
    expect(versions).toHaveLength(3);
    expect(versions[1]?.parentVersionId).toBe(versions[0]?.id);
    expect(versions[2]?.parentVersionId).toBe(versions[1]?.id);

    const decisions = await sql`
      select outcome, reason_category as "reasonCategory"
      from decisions
      where user_id = ${userId}
      order by created_at, id
    `;
    expect(decisions).toHaveLength(2);
    expect(
      decisions.every(
        (decision) =>
          decision.outcome === "EDITED" &&
          decision.reasonCategory === "EXERCISE_SWAP",
      ),
    ).toBe(true);

    const audit = await sql`
      select event_type as "eventType", payload
      from audit_events
      where user_id = ${userId} and event_type = 'PLAN_VERSION_CREATED'
      order by created_at, id
    `;
    expect(audit).toHaveLength(2);
    expect(audit[0]?.payload.action).toBe("EXERCISE_REPLACED");

    const latestPrimary = await sql`
      select ev.slug
      from prescriptions p
      join exercise_variants ev on ev.id = p.exercise_variant_id
      join plan_versions pv on pv.id = p.plan_version_id
      where pv.cycle_id = ${cycleId}
        and pv.version = (select max(version) from plan_versions where cycle_id = ${cycleId})
        and p.session_key = ${session!.sessionKey}
        and p.role = 'PRIMARY'
      order by p.planned_order
    `;
    expect(latestPrimary.map((row) => row.slug)).toContain("dumbbell_rdl");
  } finally {
    await sql.end();
  }
});
