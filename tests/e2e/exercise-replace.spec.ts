import { expect, test } from "@playwright/test";
import {
  createDb,
  getNextSession,
  getSessionPrescriptions,
  onboard,
} from "./helpers";

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

test("replaces a primary with a library exercise and keeps it on future days of the same type", async ({
  page,
}) => {
  const sql = createDb();
  try {
    const { cycleId } = await onboard(page, { sql });
    const session = await getNextSession(sql, cycleId);
    const prescriptions = await getSessionPrescriptions(sql, session!.id);
    const primary = prescriptions.find((item) => item.role === "PRIMARY");
    expect(primary).toBeTruthy();
    const oldOrder = await sql`
      select planned_order as "plannedOrder"
      from prescriptions where id = ${primary!.id}
    `;

    const replaced = await page.request.post(
      `/api/prescriptions/${primary!.id}/replace`,
      { data: { libraryId: "Barbell_Squat" } },
    );
    expect(replaced.ok()).toBeTruthy();
    const body = (await replaced.json()) as {
      to: { variantName: string; exerciseName: string };
    };
    expect(body.to.exerciseName).toBe("Приседания со штангой");
    expect(body.to.variantName).toBe("Приседания со штангой");

    const latest = await sql`
      select pv.version, ev.slug, ev.library_id as "libraryId"
      from plan_versions pv
      join prescriptions p on p.plan_version_id = pv.id
      join exercise_variants ev on ev.id = p.exercise_variant_id
      where pv.cycle_id = ${cycleId}
        and pv.version = (select max(version) from plan_versions where cycle_id = ${cycleId})
        and p.session_key = ${session!.sessionKey}
        and p.planned_order = ${oldOrder[0]!.plannedOrder}
        and p.role = 'PRIMARY'
      limit 1
    `;
    expect(latest[0]?.libraryId).toBe("Barbell_Squat");
    expect(latest[0]?.slug).toBe("lib_barbell_squat");

    const sameType = await sql`
      select s.session_index as "sessionIndex", ev.slug
      from sessions s
      join prescriptions p on p.plan_version_id = s.plan_version_id
      join exercise_variants ev on ev.id = p.exercise_variant_id
      where s.cycle_id = ${cycleId}
        and s.session_key = ${session!.sessionKey}
        and s.status = 'PLANNED'
        and p.session_key = s.session_key
        and p.planned_order = ${oldOrder[0]!.plannedOrder}
        and p.role = 'PRIMARY'
      order by s.session_index
    `;
    expect(sameType.length).toBeGreaterThan(1);
    expect(
      sameType.every((row) => row.slug === "lib_barbell_squat"),
    ).toBe(true);

    const otherType = await sql`
      select distinct ev.slug
      from sessions s
      join prescriptions p on p.plan_version_id = s.plan_version_id
      join exercise_variants ev on ev.id = p.exercise_variant_id
      where s.cycle_id = ${cycleId}
        and s.session_key <> ${session!.sessionKey}
        and s.status = 'PLANNED'
        and p.session_key = s.session_key
    `;
    expect(
      otherType.some((row) => row.slug === "lib_barbell_squat"),
    ).toBe(false);
  } finally {
    await sql.end();
  }
});

test("finds a library exercise in the replacement picker", async ({ page }) => {
  const sql = createDb();
  try {
    const { cycleId } = await onboard(page, { sql });
    const session = await getNextSession(sql, cycleId);
    await page.goto(`/sessions/${session!.id}`);

    const primaryRow = page
      .locator(".exercise")
      .filter({ hasText: "Румынская тяга" })
      .first();
    await primaryRow.getByRole("button", { name: "Заменить" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Заменить упражнение",
    });
    await dialog
      .getByPlaceholder("Например, приседания")
      .fill("приседания со штангой");
    const result = dialog
      .getByRole("button", { name: /Приседания со штангой/ })
      .first();
    await expect(result).toBeVisible({ timeout: 5_000 });
    await result.click();
    await dialog.getByRole("button", { name: "Заменить" }).click();
    await expect(
      page.locator(".exercise-name").filter({
        hasText: "Приседания со штангой",
      }),
    ).toBeVisible();
  } finally {
    await sql.end();
  }
});
