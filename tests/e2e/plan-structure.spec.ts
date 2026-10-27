import { expect, test } from "@playwright/test";
import { createDb, getNextSession, onboard } from "./helpers";

test("adds a library accessory and keeps it on future days of the same type", async ({
  page,
}) => {
  const sql = createDb();
  try {
    const { cycleId } = await onboard(page, { sql });
    const session = await getNextSession(sql, cycleId);
    const blocks = await sql`
      select tb.key
      from target_blocks tb
      join training_cycles c on c.current_plan_version_id = tb.plan_version_id
      where c.id = ${cycleId} and tb.session_key = ${session!.sessionKey}
      order by tb.key
    `;
    const blockKey = (blocks.find((row) => row.key === "posterior_chain") ??
      blocks[0])!.key as string;

    const added = await page.request.post(
      `/api/sessions/${session!.id}/exercises`,
      { data: { libraryId: "Plank", blockKey } },
    );
    expect(added.ok()).toBeTruthy();
    const body = (await added.json()) as {
      version: number;
      prescriptionId: string;
    };

    const current = await sql`
      select p.role, ev.library_id as "libraryId", e.name
      from prescriptions p
      join exercise_variants ev on ev.id = p.exercise_variant_id
      join exercises e on e.id = ev.exercise_id
      where p.plan_version_id = (
        select current_plan_version_id from training_cycles where id = ${cycleId}
      )
        and p.session_key = ${session!.sessionKey}
        and ev.library_id = 'Plank'
    `;
    expect(current).toHaveLength(1);
    expect(current[0]?.role).toBe("ACCESSORY");
    expect(current[0]?.name).toBe("Планка");

    const future = await sql`
      select count(distinct s.id)::int as n
      from sessions s
      join prescriptions p on p.plan_version_id = s.plan_version_id
      join exercise_variants ev on ev.id = p.exercise_variant_id
      where s.cycle_id = ${cycleId}
        and s.session_key = ${session!.sessionKey}
        and s.status = 'PLANNED'
        and p.session_key = s.session_key
        and ev.library_id = 'Plank'
    `;
    expect(future[0]?.n).toBeGreaterThan(1);

    const otherType = await sql`
      select count(*)::int as n
      from sessions s
      join prescriptions p on p.plan_version_id = s.plan_version_id
      join exercise_variants ev on ev.id = p.exercise_variant_id
      where s.cycle_id = ${cycleId}
        and s.session_key <> ${session!.sessionKey}
        and s.status = 'PLANNED'
        and p.session_key = s.session_key
        and ev.library_id = 'Plank'
    `;
    expect(otherType[0]?.n).toBe(0);

    const audit = await sql`
      select payload
      from audit_events
      where entity_id = (
        select current_plan_version_id::text from training_cycles where id = ${cycleId}
      )
        and event_type = 'PLAN_VERSION_CREATED'
    `;
    expect(audit[0]?.payload.action).toBe("EXERCISE_ADDED");
    expect(body.version).toBeGreaterThan(1);
  } finally {
    await sql.end();
  }
});

test("removes an accessory from the current and future days of the same type", async ({
  page,
}) => {
  const sql = createDb();
  try {
    const { cycleId } = await onboard(page, { sql });
    const session = await getNextSession(sql, cycleId);
    const blocks = await sql`
      select tb.key
      from target_blocks tb
      join training_cycles c on c.current_plan_version_id = tb.plan_version_id
      where c.id = ${cycleId} and tb.session_key = ${session!.sessionKey}
      order by tb.key
    `;
    const blockKey = (blocks.find((row) => row.key === "posterior_chain") ??
      blocks[0])!.key as string;
    const added = await page.request.post(
      `/api/sessions/${session!.id}/exercises`,
      { data: { libraryId: "Plank", blockKey } },
    );
    expect(added.ok()).toBeTruthy();
    const addedBody = (await added.json()) as { prescriptionId: string };

    const removed = await page.request.post(
      `/api/sessions/${session!.id}/exercises/${addedBody.prescriptionId}/remove`,
    );
    expect(removed.ok()).toBeTruthy();

    const current = await sql`
      select count(*)::int as n
      from prescriptions p
      join exercise_variants ev on ev.id = p.exercise_variant_id
      where p.plan_version_id = (
        select current_plan_version_id from training_cycles where id = ${cycleId}
      )
        and p.session_key = ${session!.sessionKey}
        and ev.library_id = 'Plank'
    `;
    expect(current[0]?.n).toBe(0);

    const future = await sql`
      select count(*)::int as n
      from sessions s
      join prescriptions p on p.plan_version_id = s.plan_version_id
      join exercise_variants ev on ev.id = p.exercise_variant_id
      where s.cycle_id = ${cycleId}
        and s.session_key = ${session!.sessionKey}
        and s.status = 'PLANNED'
        and p.session_key = s.session_key
        and ev.library_id = 'Plank'
    `;
    expect(future[0]?.n).toBe(0);
  } finally {
    await sql.end();
  }
});

test("keeps saved sets when adding an exercise during workout", async ({
  page,
}) => {
  const sql = createDb();
  try {
    const { cycleId } = await onboard(page, { sql });
    const session = await getNextSession(sql, cycleId);
    const prescriptions = await sql`
      select p.id, p.load_mode as "loadMode"
      from prescriptions p
      where p.plan_version_id = (
        select current_plan_version_id from training_cycles where id = ${cycleId}
      )
        and p.session_key = ${session!.sessionKey}
        and p.load_mode = 'EXTERNAL'
      limit 1
    `;
    const prescription = prescriptions[0]!;
    await page.request.post(`/api/sessions/${session!.id}/start`);
    const saved = await page.request.post(
      `/api/sessions/${session!.id}/sets`,
      {
        data: {
          clientSetId: crypto.randomUUID(),
          prescriptionId: prescription.id,
          setType: "WORKING",
          weightKg: 40,
          assistanceKg: null,
          addedKg: null,
          reps: 8,
          rir: 2,
          technique: "NORMAL",
          pain: false,
          completed: true,
          actualOrder: 0,
        },
      },
    );
    expect(saved.ok()).toBeTruthy();

    const added = await page.request.post(
      `/api/sessions/${session!.id}/exercises`,
      { data: { libraryId: "Plank", blockKey: "posterior_chain" } },
    );
    expect(added.ok()).toBeTruthy();

    const rows = await sql`
      select sp.prescription_id::text as "prescriptionId",
        p.plan_version_id::text as "planVersionId",
        (select current_plan_version_id::text from training_cycles where id = ${cycleId}) as "currentVersionId"
      from set_performances sp
      join prescriptions p on p.id = sp.prescription_id
      where sp.session_id = ${session!.id}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.planVersionId).toBe(rows[0]?.currentVersionId);
    expect(rows[0]?.prescriptionId).not.toBe(prescription.id);
  } finally {
    await sql.end();
  }
});

test("adds and removes an accessory through the session UI", async ({
  page,
}) => {
  const sql = createDb();
  try {
    const { cycleId } = await onboard(page, { sql });
    const session = await getNextSession(sql, cycleId);
    await page.goto(`/sessions/${session!.id}`);

    await page
      .getByRole("button", { name: "＋ Добавить упражнение" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Добавить упражнение",
    });
    await dialog.getByLabel("Блок").selectOption("posterior_chain");
    await dialog
      .getByPlaceholder("Например, приседания")
      .fill("планка");
    const result = dialog
      .getByRole("button", { name: /Планка/ })
      .first();
    await expect(result).toBeVisible({ timeout: 5_000 });
    await result.click();
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(
      page.locator(".exercise-name").filter({ hasText: "Планка" }),
    ).toBeVisible();

    page.on("dialog", (confirm) => confirm.accept());
    await page
      .locator(".exercise")
      .filter({ hasText: "Планка" })
      .getByRole("button", { name: "удалить из плана" })
      .click();
    await expect(
      page.locator(".exercise-name").filter({ hasText: "Планка" }),
    ).toHaveCount(0);
  } finally {
    await sql.end();
  }
});
