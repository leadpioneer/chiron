import { eq, inArray } from "drizzle-orm";
import {
  athleteProfiles,
  auditEvents,
  decisions,
  getDb,
  identities,
  llmCalls,
  magicLinks,
  planVersions,
  prescriptions,
  recommendations,
  safetyEvents,
  sessionPerformances,
  sessions,
  setPerformances,
  targetBlocks,
  trainingCycles,
  users,
  wellnessChecks,
} from "@chiron/db";

export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const db = getDb();
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const profileRows = await db
    .select()
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, userId));
  const cycleRows = await db
    .select()
    .from(trainingCycles)
    .where(eq(trainingCycles.userId, userId));
  const cycleIds = cycleRows.map((cycle) => cycle.id);

  const versionRows =
    cycleIds.length > 0
      ? await db
          .select()
          .from(planVersions)
          .where(inArray(planVersions.cycleId, cycleIds))
      : [];
  const versionIds = versionRows.map((version) => version.id);
  const blockRows =
    versionIds.length > 0
      ? await db
          .select()
          .from(targetBlocks)
          .where(inArray(targetBlocks.planVersionId, versionIds))
      : [];
  const prescriptionRows =
    versionIds.length > 0
      ? await db
          .select()
          .from(prescriptions)
          .where(inArray(prescriptions.planVersionId, versionIds))
      : [];
  const sessionRows =
    cycleIds.length > 0
      ? await db
          .select()
          .from(sessions)
          .where(inArray(sessions.cycleId, cycleIds))
      : [];
  const sessionIds = sessionRows.map((session) => session.id);
  const setRows =
    sessionIds.length > 0
      ? await db
          .select()
          .from(setPerformances)
          .where(inArray(setPerformances.sessionId, sessionIds))
      : [];
  const performanceRows =
    sessionIds.length > 0
      ? await db
          .select()
          .from(sessionPerformances)
          .where(inArray(sessionPerformances.sessionId, sessionIds))
      : [];
  const wellnessRows = await db
    .select()
    .from(wellnessChecks)
    .where(eq(wellnessChecks.userId, userId));
  const recommendationRows =
    cycleIds.length > 0
      ? await db
          .select()
          .from(recommendations)
          .where(inArray(recommendations.cycleId, cycleIds))
      : [];
  const decisionRows = await db
    .select()
    .from(decisions)
    .where(eq(decisions.userId, userId));
  const auditRows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.userId, userId));
  const safetyRows = await db
    .select()
    .from(safetyEvents)
    .where(eq(safetyEvents.userId, userId));
  const llmRows = await db
    .select()
    .from(llmCalls)
    .where(eq(llmCalls.userId, userId));

  return {
    exportedAt: new Date().toISOString(),
    user: userRows[0] ?? null,
    profile: profileRows[0] ?? null,
    cycles: cycleRows,
    planVersions: versionRows,
    targetBlocks: blockRows,
    prescriptions: prescriptionRows,
    sessions: sessionRows,
    setPerformances: setRows,
    sessionPerformances: performanceRows,
    wellnessChecks: wellnessRows,
    recommendations: recommendationRows,
    decisions: decisionRows,
    safetyEvents: safetyRows,
    llmCalls: llmRows,
    auditEvents: auditRows,
  };
}

export async function softDeleteAccount(userId: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const oldEmail = rows[0]?.email ?? null;
  await db
    .update(users)
    .set({
      email: `deleted-${userId}@local.invalid`,
      displayName: "Удалённый пользователь",
      deletedAt: new Date(),
    })
    .where(eq(users.id, userId));
  // Identities are removed immediately so no login method survives.
  // Training rows are anonymized by the account deletion job within 30 days.
  await db.delete(identities).where(eq(identities.userId, userId));
  if (oldEmail) {
    await db.delete(magicLinks).where(eq(magicLinks.email, oldEmail));
  }
}
