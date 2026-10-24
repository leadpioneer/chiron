import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: path.resolve(process.cwd(), ".env") });

export type Sql = ReturnType<typeof postgres>;

export interface OnboardResult {
  email: string;
  userId: string;
  cycleId: string;
}

export interface PrescriptionRow {
  id: string;
  role: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetReps: number;
  targetRir: number;
  loadMode: string;
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
  incrementKg: number;
  sessionKey: string;
}

export type SessionRpe = "EASY" | "MODERATE" | "HARD" | "MAX";

export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL must be configured");
  }
  const url = new URL(base);
  url.pathname = "/chiron_test";
  return url.toString();
}

export function createDb(): Sql {
  return postgres(testDatabaseUrl(), { max: 1, onnotice: () => undefined });
}

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@chiron.test`;
}

export function addDaysIso(value: string | Date, days: number): string {
  const normalized =
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const date = new Date(`${normalized}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function getFollowingSession(
  sql: Sql,
  cycleId: string,
  sessionIndex: number,
) {
  const rows = await sql`
    select
      id,
      session_index as "sessionIndex",
      planned_date::text as "plannedDate",
      status
    from sessions
    where cycle_id = ${cycleId} and session_index > ${sessionIndex}
    order by session_index
    limit 1
  `;
  return rows[0] as
    | {
        id: string;
        sessionIndex: number;
        plannedDate: string;
        status: string;
      }
    | undefined;
}

export function onboardingInput(scheme: "EVERY_OTHER_DAY" | "FIVE_DAY_CYCLE") {
  return {
    displayName: `E2E ${scheme}`,
    experience: "RETURNING",
    goal: "BOTH",
    bodyweightKg: 80,
    heightCm: 180,
    bodyFatPercent: 18,
    breakWeeks: null,
    trainingScheme: scheme,
    variants: {
      verticalPull: "assisted_pull_up",
      hinge: "barbell_rdl",
      squat: "front_squat",
      press: "barbell_bench",
    },
    accessories: {
      row: true,
      pullover: true,
      legExtension: true,
      pecDeck: true,
    },
    aesthetic: ["biceps_curl", "triceps_pushdown"],
    startingLoads: {
      verticalPull: 30,
      hinge: 100,
      squat: 60,
      press: 60,
    },
  };
}

export async function login(page: Page, email: string): Promise<void> {
  const response = await page.request.post("/api/auth/request-link", {
    data: { email },
  });
  expect(response.ok(), "magic link request succeeds").toBeTruthy();
  const body = (await response.json()) as { devLink?: string };
  expect(body.devLink, "dev magic link is returned").toBeTruthy();
  await page.goto(body.devLink!);
  await expect(page).toHaveURL(/\/onboarding/);
}

export async function getUserByEmail(sql: Sql, email: string) {
  const rows = await sql`
    select id, email, display_name as "displayName"
    from users
    where email = ${email}
    limit 1
  `;
  expect(rows[0], "user exists").toBeTruthy();
  return rows[0] as { id: string; email: string; displayName: string };
}

export async function getActiveCycle(sql: Sql, userId: string) {
  const rows = await sql`
    select
      id,
      start_date::text as "startDate",
      end_date::text as "endDate",
      status,
      current_plan_version_id as "currentPlanVersionId",
      return_phase_sessions as "returnPhaseSessions",
      close_reason as "closeReason"
    from training_cycles
    where user_id = ${userId} and status = 'ACTIVE'
    order by created_at desc
    limit 1
  `;
  return rows[0] as
    | {
        id: string;
        startDate: string;
        endDate: string;
        status: string;
        currentPlanVersionId: string | null;
        returnPhaseSessions: number;
        closeReason: string | null;
      }
    | undefined;
}

export async function getNextSession(sql: Sql, cycleId: string) {
  const rows = await sql`
    select
      id,
      session_index as "sessionIndex",
      session_key as "sessionKey",
      planned_date::text as "plannedDate",
      status,
      is_return as "isReturn"
    from sessions
    where cycle_id = ${cycleId} and status in ('PLANNED', 'IN_PROGRESS')
    order by session_index
    limit 1
  `;
  return rows[0] as
    | {
        id: string;
        sessionIndex: number;
        sessionKey: string;
        plannedDate: string;
        status: string;
        isReturn: boolean;
      }
    | undefined;
}

export async function getSessionPrescriptions(
  sql: Sql,
  sessionId: string,
): Promise<PrescriptionRow[]> {
  const rows = await sql`
    select
      p.id,
      p.role,
      p.sets,
      p.rep_min as "repMin",
      p.rep_max as "repMax",
      p.target_reps as "targetReps",
      p.target_rir as "targetRir",
      p.load_mode as "loadMode",
      p.weight_kg as "weightKg",
      p.assistance_kg as "assistanceKg",
      p.added_kg as "addedKg",
      p.increment_kg as "incrementKg",
      p.session_key as "sessionKey"
    from prescriptions p
    join sessions s
      on s.plan_version_id = p.plan_version_id
     and s.session_key = p.session_key
    where s.id = ${sessionId}
    order by p.planned_order
  `;
  return rows as PrescriptionRow[];
}

export async function onboard(
  page: Page,
  options: {
    email?: string;
    scheme?: "EVERY_OTHER_DAY" | "FIVE_DAY_CYCLE";
    sql: Sql;
  },
): Promise<OnboardResult> {
  const email = options.email ?? uniqueEmail();
  const scheme = options.scheme ?? "EVERY_OTHER_DAY";
  await login(page, email);
  const response = await page.request.post("/api/onboarding", {
    data: onboardingInput(scheme),
  });
  expect(response.status(), "onboarding succeeds").toBe(200);
  const user = await getUserByEmail(options.sql, email);
  const cycle = await getActiveCycle(options.sql, user.id);
  expect(cycle, "active cycle exists").toBeTruthy();
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: /Тяни|Толкай/ })).toBeVisible();
  return { email, userId: user.id, cycleId: cycle!.id };
}

export async function startSession(
  page: Page,
  sessionId: string,
): Promise<void> {
  const response = await page.request.post(`/api/sessions/${sessionId}/start`);
  expect(response.ok(), "session starts").toBeTruthy();
}

export function defaultLoad(prescription: PrescriptionRow): {
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
} {
  if (prescription.loadMode === "EXTERNAL") {
    return {
      weightKg: prescription.weightKg ?? 40,
      assistanceKg: null,
      addedKg: null,
    };
  }
  if (prescription.loadMode === "ASSISTED") {
    return {
      weightKg: null,
      assistanceKg: prescription.assistanceKg ?? 30,
      addedKg: null,
    };
  }
  if (prescription.loadMode === "BODYWEIGHT_PLUS") {
    return {
      weightKg: null,
      assistanceKg: null,
      addedKg: prescription.addedKg ?? 0,
    };
  }
  return { weightKg: null, assistanceKg: null, addedKg: null };
}

export async function saveSetsAndComplete(
  page: Page,
  sessionId: string,
  prescriptions: PrescriptionRow[],
  options: {
    reps?: number | ((prescription: PrescriptionRow) => number);
    rir?: number;
    sessionRpe?: SessionRpe;
    comment?: string | null;
    load?: (prescription: PrescriptionRow) => {
      weightKg?: number | null;
      assistanceKg?: number | null;
      addedKg?: number | null;
    };
    saveSets?: boolean;
  } = {},
): Promise<{ recommendations: Array<{ id: string; action: string }> }> {
  await startSession(page, sessionId);
  if (options.saveSets !== false) {
    let order = 0;
    for (const prescription of prescriptions) {
      const load = {
        ...defaultLoad(prescription),
        ...(options.load?.(prescription) ?? {}),
      };
      const reps =
        typeof options.reps === "function"
          ? options.reps(prescription)
          : (options.reps ?? prescription.repMax);
      for (let index = 0; index < prescription.sets; index += 1) {
        const response = await page.request.post(
          `/api/sessions/${sessionId}/sets`,
          {
            data: {
              clientSetId: crypto.randomUUID(),
              prescriptionId: prescription.id,
              setType: "WORKING",
              weightKg: load.weightKg ?? null,
              assistanceKg: load.assistanceKg ?? null,
              addedKg: load.addedKg ?? null,
              reps,
              rir: options.rir ?? 3,
              technique: "NORMAL",
              pain: false,
              completed: true,
              actualOrder: order++,
            },
          },
        );
        expect(response.ok(), "set is saved").toBeTruthy();
      }
    }
  }
  const response = await page.request.post(
    `/api/sessions/${sessionId}/complete`,
    {
      data: {
        sessionRpe: options.sessionRpe ?? "MODERATE",
        comment: options.comment ?? null,
      },
    },
  );
  expect(response.ok(), "session completes").toBeTruthy();
  return (await response.json()) as {
    recommendations: Array<{ id: string; action: string }>;
  };
}

export async function applyRecommendation(
  page: Page,
  recommendationId: string,
  options: {
    outcome?: "ACCEPTED" | "EDITED" | "REJECTED";
    edits?: Array<Record<string, unknown>>;
    reasonCategory?: string | null;
    comment?: string | null;
  } = {},
): Promise<void> {
  const response = await page.request.post(
    `/api/recommendations/${recommendationId}/decision`,
    {
      data: {
        outcome: options.outcome ?? "ACCEPTED",
        reasonCategory: options.reasonCategory ?? null,
        comment: options.comment ?? null,
        edits: options.edits ?? [],
      },
    },
  );
  expect(response.ok(), "recommendation is applied").toBeTruthy();
}

export async function backdateLastCompleted(
  sql: Sql,
  userId: string,
  days: number,
): Promise<void> {
  await sql`
    update sessions
    set actual_date = current_date - ${days}::int
    where id = (
      select s.id
      from sessions s
      join training_cycles c on c.id = s.cycle_id
      where c.user_id = ${userId} and s.status = 'COMPLETED'
      order by s.actual_date desc nulls last, s.session_index desc
      limit 1
    )
  `;
}

export async function getPendingRecommendations(
  sql: Sql,
  cycleId: string,
  sessionId?: string,
) {
  const rows = sessionId
    ? await sql`
        select
          id,
          action,
          status,
          explanation,
          candidates -> 'ruleIds' as "ruleIds"
        from recommendations
        where cycle_id = ${cycleId}
          and status = 'PENDING'
          and session_id = ${sessionId}
        order by created_at
      `
    : await sql`
        select
          id,
          action,
          status,
          explanation,
          candidates -> 'ruleIds' as "ruleIds"
        from recommendations
        where cycle_id = ${cycleId} and status = 'PENDING'
        order by created_at
      `;
  return rows as Array<{
    id: string;
    action: string;
    status: string;
    explanation: string;
    ruleIds: string[];
  }>;
}

export async function getCycleStatus(sql: Sql, cycleId: string) {
  const rows = await sql`
    select status, close_reason as "closeReason"
    from training_cycles
    where id = ${cycleId}
    limit 1
  `;
  return rows[0] as { status: string; closeReason: string | null } | undefined;
}

export async function getCycleSessions(sql: Sql, cycleId: string) {
  const rows = await sql`
    select
      session_index as "sessionIndex",
      is_return as "isReturn",
      plan_version_id as "planVersionId",
      status
    from sessions
    where cycle_id = ${cycleId}
    order by session_index
  `;
  return rows as Array<{
    sessionIndex: number;
    isReturn: boolean;
    planVersionId: string;
    status: string;
  }>;
}

export async function getPrescriptionLoads(
  sql: Sql,
  sessionId: string,
): Promise<
  Array<{
    id: string;
    role: string;
    exerciseName: string;
    loadMode: string;
    sessionKey: string;
    weightKg: number | null;
    assistanceKg: number | null;
    addedKg: number | null;
    targetRir: number;
    sets: number;
    targetReps: number;
  }>
> {
  const rows = await sql`
    select
      p.id,
      p.role,
      e.name as "exerciseName",
      p.load_mode as "loadMode",
      p.session_key as "sessionKey",
      p.weight_kg as "weightKg",
      p.assistance_kg as "assistanceKg",
      p.added_kg as "addedKg",
      p.target_rir as "targetRir",
      p.sets,
      p.target_reps as "targetReps"
    from prescriptions p
    join exercise_variants v on v.id = p.exercise_variant_id
    join exercises e on e.id = v.exercise_id
    join sessions s
      on s.plan_version_id = p.plan_version_id
     and s.session_key = p.session_key
    where s.id = ${sessionId}
    order by p.planned_order
  `;
  return rows as Array<{
    id: string;
    role: string;
    exerciseName: string;
    loadMode: string;
    sessionKey: string;
    weightKg: number | null;
    assistanceKg: number | null;
    addedKg: number | null;
    targetRir: number;
    sets: number;
    targetReps: number;
  }>;
}
