import { and, asc, desc, eq } from "drizzle-orm";
import type { LoadMode } from "@chiron/contracts";
import {
  computeExerciseMetrics,
  type SetRecord,
} from "@chiron/core";
import {
  athleteProfiles,
  auditEvents,
  decisions,
  exerciseVariants,
  exercises,
  getDb,
  prescriptions,
  recommendations,
  sessions,
  setPerformances,
  trainingCycles,
} from "@chiron/db";

export interface HistoryExposure {
  sessionId: string;
  date: string;
  reps: number;
  workingSets: number;
  tonnageKg: number | null;
  bestLoadKg: number | null;
  sets: Array<{
    reps: number;
    weightKg: number | null;
    assistanceKg: number | null;
    addedKg: number | null;
    rir: number | null;
  }>;
}

export interface ExerciseHistory {
  variantId: string;
  exerciseName: string;
  variantName: string;
  role: string;
  loadMode: LoadMode;
  exposures: HistoryExposure[];
}

export interface DecisionHistory {
  id: string;
  action: string;
  outcome: string;
  createdAt: string;
  explanation: string;
}

export interface AuditHistory {
  id: string;
  entity: string;
  eventType: string;
  createdAt: string;
}

export async function getHistory(userId: string): Promise<{
  exercises: ExerciseHistory[];
  decisions: DecisionHistory[];
  audit: AuditHistory[];
  bodyweightKg: number | null;
}> {
  const db = getDb();
  const profileRows = await db
    .select({ bodyweightKg: athleteProfiles.bodyweightKg })
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, userId))
    .limit(1);
  const bodyweightKg = profileRows[0]?.bodyweightKg ?? null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      date: sessions.actualDate,
      plannedDate: sessions.plannedDate,
      set: setPerformances,
      prescription: prescriptions,
      variant: exerciseVariants,
      exerciseName: exercises.name,
    })
    .from(setPerformances)
    .innerJoin(sessions, eq(setPerformances.sessionId, sessions.id))
    .innerJoin(trainingCycles, eq(sessions.cycleId, trainingCycles.id))
    .innerJoin(
      prescriptions,
      eq(setPerformances.prescriptionId, prescriptions.id),
    )
    .innerJoin(
      exerciseVariants,
      eq(prescriptions.exerciseVariantId, exerciseVariants.id),
    )
    .innerJoin(exercises, eq(exerciseVariants.exerciseId, exercises.id))
    .where(
      and(
        eq(trainingCycles.userId, userId),
        eq(sessions.status, "COMPLETED"),
      ),
    )
    .orderBy(asc(sessions.actualDate), asc(setPerformances.actualOrder));

  const byVariant = new Map<
    string,
    {
      exerciseName: string;
      variantName: string;
      role: string;
      loadMode: LoadMode;
      sessions: Map<
        string,
        {
          date: string;
          sets: SetRecord[];
        }
      >;
    }
  >();

  for (const row of rows) {
    const key = row.variant.id;
    const existing = byVariant.get(key);
    const target =
      existing ??
      {
        exerciseName: row.exerciseName,
        variantName: row.variant.name,
        role: row.prescription.role,
        loadMode: row.prescription.loadMode as LoadMode,
        sessions: new Map(),
      };
    if (!existing) byVariant.set(key, target);

    const sessionId = row.sessionId;
    const session =
      target.sessions.get(sessionId) ??
      {
        date: row.date ?? row.plannedDate,
        sets: [],
      };
    session.sets.push({
      setType: row.set.setType as SetRecord["setType"],
      weightKg: row.set.weightKg,
      assistanceKg: row.set.assistanceKg,
      addedKg: row.set.addedKg,
      reps: row.set.reps,
      rir: row.set.rir,
      technique: row.set.technique as SetRecord["technique"],
      pain: row.set.pain,
      completed: row.set.completed,
      actualOrder: row.set.actualOrder,
    });
    target.sessions.set(sessionId, session);
  }

  const exercisesHistory: ExerciseHistory[] = [];
  for (const [variantId, value] of byVariant) {
    const exposures: HistoryExposure[] = [];
    for (const [sessionId, session] of value.sessions) {
      const metrics = computeExerciseMetrics(
        {
          loadMode: value.loadMode,
          sets: session.sets.map((set) => ({
            ...set,
            loadMode: value.loadMode,
          })),
        },
        bodyweightKg,
      );
      exposures.push({
        sessionId,
        date: session.date,
        reps: metrics.reps,
        workingSets: metrics.workingSets,
        tonnageKg: metrics.tonnageKg,
        bestLoadKg: metrics.bestEffectiveLoadKg,
        sets: session.sets
          .filter((set) => set.completed)
          .map((set) => ({
            reps: set.reps,
            weightKg: set.weightKg,
            assistanceKg: set.assistanceKg,
            addedKg: set.addedKg,
            rir: set.rir,
          })),
      });
    }
    exposures.sort((a, b) => (a.date < b.date ? 1 : -1));
    exercisesHistory.push({
      variantId,
      exerciseName: value.exerciseName,
      variantName: value.variantName,
      role: value.role,
      loadMode: value.loadMode,
      exposures,
    });
  }

  exercisesHistory.sort((a, b) =>
    a.role === b.role
      ? a.exerciseName.localeCompare(b.exerciseName)
      : a.role === "PRIMARY"
        ? -1
        : 1,
  );

  const decisionRows = await db
    .select({
      id: decisions.id,
      outcome: decisions.outcome,
      createdAt: decisions.createdAt,
      action: recommendations.action,
      explanation: recommendations.explanation,
    })
    .from(decisions)
    .innerJoin(
      recommendations,
      eq(decisions.recommendationId, recommendations.id),
    )
    .innerJoin(trainingCycles, eq(recommendations.cycleId, trainingCycles.id))
    .where(eq(trainingCycles.userId, userId))
    .orderBy(desc(decisions.createdAt))
    .limit(30);

  const auditRows = await db
    .select({
      id: auditEvents.id,
      entity: auditEvents.entity,
      eventType: auditEvents.eventType,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .where(eq(auditEvents.userId, userId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(20);

  return {
    exercises: exercisesHistory,
    bodyweightKg,
    decisions: decisionRows.map((row) => ({
      id: row.id,
      action: row.action,
      outcome: row.outcome,
      createdAt: row.createdAt.toISOString(),
      explanation: row.explanation,
    })),
    audit: auditRows.map((row) => ({
      id: row.id,
      entity: row.entity,
      eventType: row.eventType,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
