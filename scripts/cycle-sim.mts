import assert from "node:assert/strict";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import type { OnboardingInput } from "@chiron/contracts";

loadEnv({ path: path.resolve(import.meta.dirname, "..", ".env") });

function testUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL must be configured");
  }
  const url = new URL(base);
  url.pathname = "/chiron_test";
  return url.toString();
}

const url = testUrl();
const databaseName = new URL(url).pathname.replace(/^\//, "");
if (!/test/i.test(databaseName)) {
  throw new Error(
    `Refusing to run the cycle simulator against ${databaseName}: use a test database`,
  );
}
process.env.DATABASE_URL = url;

const {
  createCycleForUser,
  getActiveCycle,
  getNextSession,
  getSessionView,
  advanceCycle,
} = await import("../apps/web/src/lib/plan-service");
const { startSession, upsertSet } = await import(
  "../apps/web/src/lib/session-service"
);
const {
  createSessionRecommendations,
  applyDecision,
} = await import("../apps/web/src/lib/recommendation-service");
const { closeDb } = await import("@chiron/db");

const sql = postgres(url, { max: 1, onnotice: () => undefined });

const START_DATE = "2026-01-05";
const DECLINE_FIRST = 8;
const DECLINE_SECOND = 10;

interface SchemeResult {
  scheme: "EVERY_OTHER_DAY" | "FIVE_DAY_CYCLE";
  sessions: number;
  versions: number;
  decisions: number;
  recommendations: number;
  audit: number;
  deloads: number;
  nextCycleSessions: number;
}

function onboardingInput(
  scheme: "EVERY_OTHER_DAY" | "FIVE_DAY_CYCLE",
): OnboardingInput {
  return {
    displayName: `Sim ${scheme}`,
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

function sessionLoad(prescription: {
  loadMode: string;
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
}): {
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

async function runScheme(
  scheme: "EVERY_OTHER_DAY" | "FIVE_DAY_CYCLE",
  expectedSessions: number,
): Promise<SchemeResult> {
  const email = `sim-${scheme.toLowerCase()}-${Date.now()}@chiron.test`;
  const userRows = await sql`
    insert into users (email, display_name)
    values (${email}, ${`Sim ${scheme}`})
    returning id
  `;
  const userId = userRows[0]?.id as string;
  assert.ok(userId, "user was created");

  const cycleId = await createCycleForUser(userId, onboardingInput(scheme), {
    today: START_DATE,
  });
  const cycle = await getActiveCycle(userId);
  assert.equal(cycle?.id, cycleId, "active cycle exists");

  let session = await getNextSession(cycleId);
  let index = 0;
  let deloads = 0;
  let lastDate = START_DATE;

  while (session) {
    const currentSession = session;
    const view = await getSessionView(currentSession.id, userId, {
      today: currentSession.plannedDate,
    });
    assert.ok(view, `session ${index} view exists`);

    const repsFor = (repMin: number, repMax: number): number => {
      if (index === DECLINE_FIRST) return Math.max(1, repMin - 1);
      if (index === DECLINE_SECOND) return Math.max(1, repMin - 2);
      return repMax;
    };
    const rpe = index === DECLINE_SECOND ? "MAX" : "MODERATE";

    await startSession(userId, currentSession.id, {
      today: currentSession.plannedDate,
    });

    const currentPrescriptionIds = new Set<string>();
    for (const block of view.blocks) {
      for (const prescription of block.prescriptions) {
        currentPrescriptionIds.add(prescription.id);
        const load = sessionLoad(prescription);
        const reps = repsFor(prescription.repMin, prescription.repMax);
        for (let setIndex = 0; setIndex < prescription.sets; setIndex += 1) {
          await upsertSet(userId, currentSession.id, {
            clientSetId: crypto.randomUUID(),
            prescriptionId: prescription.id,
            setType: "WORKING",
            weightKg: load.weightKg,
            assistanceKg: load.assistanceKg,
            addedKg: load.addedKg,
            reps,
            rir: 3,
            technique: "NORMAL",
            pain: false,
            completed: true,
            actualOrder: setIndex,
          });
        }
      }
    }

    const recommendations = await createSessionRecommendations(
      {
        userId,
        sessionId: currentSession.id,
        sessionRpe: rpe,
        comment: null,
      },
      { today: currentSession.plannedDate },
    );

    for (const recommendation of recommendations) {
      for (const item of recommendation.items) {
        assert.ok(
          currentPrescriptionIds.has(item.prescriptionId),
          `recommendation ${recommendation.id} stayed inside the session`,
        );
      }
      if (recommendation.action === "DELOAD") {
        deloads += 1;
        assert.equal(
          recommendation.changes.length,
          2,
          "deload touches two primaries",
        );
      }
      await applyDecision({
        userId,
        recommendationId: recommendation.id,
        decision: {
          outcome: "ACCEPTED",
          reasonCategory: null,
          comment: null,
          edits: [],
        },
      });
    }

    lastDate = currentSession.plannedDate;
    index += 1;
    assert.ok(index <= expectedSessions, "session count does not exceed plan");
    session = await getNextSession(cycleId);
  }

  assert.equal(index, expectedSessions, `completed ${expectedSessions} sessions`);
  assert.equal(deloads > 0, true, "a deload was proposed and accepted");

  assert.equal(await getNextSession(cycleId), null, "no planned sessions left");

  const newCycleId = await advanceCycle(userId, { today: lastDate });
  const oldCycleRows = await sql`
    select status from training_cycles where id = ${cycleId}
  `;
  assert.equal(oldCycleRows[0]?.status, "COMPLETED", "cycle is completed");
  const newCycle = await getActiveCycle(userId);
  assert.equal(newCycle?.id, newCycleId, "next cycle is active");
  assert.notEqual(newCycleId, cycleId, "next cycle is new");

  const nextSessions = await sql`
    select count(*)::int as n from sessions where cycle_id = ${newCycleId}
  `;
  assert.equal(
    nextSessions[0]?.n,
    expectedSessions,
    "next cycle has the same session count",
  );

  const versions = await sql`
    select count(*)::int as n from plan_versions where cycle_id = ${cycleId}
  `;
  const decisions = await sql`
    select count(*)::int as n
    from decisions d
    join recommendations r on r.id = d.recommendation_id
    where r.cycle_id = ${cycleId}
  `;
  const recommendations = await sql`
    select count(*)::int as n from recommendations where cycle_id = ${cycleId}
  `;
  const audit = await sql`
    select count(*)::int as n from audit_events where user_id = ${userId}
  `;

  assert.ok((versions[0]?.n ?? 0) > 1, "plan versions were created");
  assert.ok((decisions[0]?.n ?? 0) > 0, "decisions were stored");
  assert.ok((recommendations[0]?.n ?? 0) > 0, "recommendations were stored");
  assert.ok((audit[0]?.n ?? 0) > 0, "audit events were stored");

  return {
    scheme,
    sessions: index,
    versions: versions[0]?.n ?? 0,
    decisions: decisions[0]?.n ?? 0,
    recommendations: recommendations[0]?.n ?? 0,
    audit: audit[0]?.n ?? 0,
    deloads,
    nextCycleSessions: nextSessions[0]?.n ?? 0,
  };
}

try {
  await sql.unsafe('truncate table "users" cascade');
  const results: SchemeResult[] = [];
  results.push(await runScheme("EVERY_OTHER_DAY", 28));
  results.push(await runScheme("FIVE_DAY_CYCLE", 23));

  for (const result of results) {
    console.log(
      [
        `[${result.scheme}]`,
        `sessions=${result.sessions}`,
        `versions=${result.versions}`,
        `decisions=${result.decisions}`,
        `recommendations=${result.recommendations}`,
        `audit=${result.audit}`,
        `deloads=${result.deloads}`,
        `nextSessions=${result.nextCycleSessions}`,
      ].join(" "),
    );
  }
  console.log("CYCLE_SIM_OK");
} finally {
  await closeDb();
  await sql.end();
}
