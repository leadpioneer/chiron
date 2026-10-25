import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const { and, eq, max } = await import("drizzle-orm");
const {
  auditEvents,
  closeDb,
  decisions,
  exerciseVariants,
  getDb,
  planVersions,
  prescriptions,
  recommendations,
  sessions,
  targetBlocks,
  trainingCycles,
} = await import("@chiron/db");

const db = getDb();
const bridgeRows = await db
  .select({ variant: exerciseVariants })
  .from(exerciseVariants)
  .where(eq(exerciseVariants.slug, "barbell_glute_bridge"))
  .limit(1);
const bridge = bridgeRows[0]?.variant;
if (!bridge) {
  throw new Error("barbell_glute_bridge is not seeded");
}

const activeCycles = await db
  .select()
  .from(trainingCycles)
  .where(eq(trainingCycles.status, "ACTIVE"));

let updated = 0;
let skipped = 0;

for (const cycle of activeCycles) {
  const currentVersionId = cycle.currentPlanVersionId;
  if (!currentVersionId) {
    skipped += 1;
    continue;
  }

  const already = await db
    .select({
      id: prescriptions.id,
      optional: prescriptions.optional,
    })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.planVersionId, currentVersionId),
        eq(prescriptions.exerciseVariantId, bridge.id),
      ),
    )
    .limit(1);
  const existingBridge = already[0];
  if (existingBridge?.optional) {
    skipped += 1;
    continue;
  }

  const blocks = await db
    .select()
    .from(targetBlocks)
    .where(eq(targetBlocks.planVersionId, currentVersionId));
  const posterior = blocks.find((block) => block.key === "posterior_chain");
  if (!posterior) {
    skipped += 1;
    continue;
  }

  const blockPrescriptions = await db
    .select({
      prescription: prescriptions,
      variantSlug: exerciseVariants.slug,
    })
    .from(prescriptions)
    .innerJoin(
      exerciseVariants,
      eq(prescriptions.exerciseVariantId, exerciseVariants.id),
    )
    .where(
      and(
        eq(prescriptions.planVersionId, currentVersionId),
        eq(prescriptions.targetBlockId, posterior.id),
      ),
    );
  const hinge = blockPrescriptions.find(
    (row) =>
      row.prescription.role === "PRIMARY" &&
      ["barbell_rdl", "dumbbell_rdl"].includes(row.variantSlug),
  );
  if (!hinge) {
    skipped += 1;
    continue;
  }
  const maxOrder = Math.max(
    ...blockPrescriptions.map((row) => row.prescription.plannedOrder),
    0,
  );

  const recommendationId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();
  const newVersionId = crypto.randomUUID();
  const userId = cycle.userId;
  const optionalFix = Boolean(existingBridge);
  const action = optionalFix
    ? "EXERCISE_OPTIONAL_SET"
    : "EXERCISE_ADDED";
  const reasonCategory = optionalFix ? "EXERCISE_OPTIONAL" : "EXERCISE_ADD";
  const explanation = optionalFix
    ? "Ягодичный мостик отмечен необязательным."
    : "Ягодичный мостик добавлен к румынской тяге.";

  await db.transaction(async (tx) => {
    const locked = await tx
      .select({
        id: trainingCycles.id,
        currentPlanVersionId: trainingCycles.currentPlanVersionId,
      })
      .from(trainingCycles)
      .where(eq(trainingCycles.id, cycle.id))
      .for("update")
      .limit(1);
    if (locked[0]?.currentPlanVersionId !== currentVersionId) {
      throw new Error(`Cycle ${cycle.id} changed during migration`);
    }

    const versionRows = await tx
      .select({ value: max(planVersions.version) })
      .from(planVersions)
      .where(eq(planVersions.cycleId, cycle.id));
    const nextVersion = (versionRows[0]?.value ?? 0) + 1;

    await tx.insert(recommendations).values({
      id: recommendationId,
      cycleId: cycle.id,
      sessionId: null,
      action: optionalFix
        ? "MANUAL_EXERCISE_OPTIONAL"
        : "MANUAL_EXERCISE_ADD",
      scopeType: "TARGET_BLOCK",
      scopeId: posterior.id,
      status: "ACCEPTED",
      explanation,
      candidates: {
        reasons: [
          optionalFix
            ? "Подсобное упражнение отмечено необязательным"
            : "Плановое дополнение подсобного упражнения",
        ],
        ruleIds: [
          optionalFix ? "MANUAL_EXERCISE_OPTIONAL" : "MANUAL_EXERCISE_ADD",
        ],
        safety: {
          label: "GREEN",
          reasons: [],
          blockProgression: false,
          pause: false,
          escalate: false,
        },
        changes: [],
      },
      evidence: {
        source: "migration",
        blockKey: "posterior_chain",
        variantSlug: bridge.slug,
      },
      rulesVersion: "1.0.0",
      promptVersion: null,
      modelVersion: "manual",
      expiresAt: null,
    });

    await tx.insert(decisions).values({
      id: decisionId,
      recommendationId,
      userId,
      outcome: "EDITED",
      reasonCategory,
      comment: null,
      before: {
        action,
        blockKey: "posterior_chain",
        exercises: blockPrescriptions.map((row) => ({
          prescriptionId: row.prescription.id,
          variantSlug: row.variantSlug,
          role: row.prescription.role,
        })),
      },
      after: {
        action,
        blockKey: "posterior_chain",
        variantSlug: bridge.slug,
        planVersionId: newVersionId,
      },
    });

    await tx.insert(planVersions).values({
      id: newVersionId,
      cycleId: cycle.id,
      version: nextVersion,
      parentVersionId: currentVersionId,
      reason: optionalFix
        ? "Ягодичный мостик отмечен необязательным"
        : "Добавлен ягодичный мостик",
      decisionId,
      rulesVersion: "1.0.0",
    });

    const blockIdMap = new Map<string, string>();
    for (const block of blocks) {
      const id = crypto.randomUUID();
      blockIdMap.set(block.id, id);
      await tx.insert(targetBlocks).values({
        id,
        planVersionId: newVersionId,
        sessionKey: block.sessionKey,
        key: block.key,
        name: block.name,
        goal: block.goal,
        primaryPrescriptionId: null,
        progressionPolicy: block.progressionPolicy,
      });
    }

    const oldPrescriptions = await tx
      .select()
      .from(prescriptions)
      .where(eq(prescriptions.planVersionId, currentVersionId));
    const prescriptionIdMap = new Map<string, string>();
    for (const item of oldPrescriptions) {
      const id = crypto.randomUUID();
      prescriptionIdMap.set(item.id, id);
      const targetBlockId = blockIdMap.get(item.targetBlockId);
      if (!targetBlockId) {
        throw new Error(`Missing target block for ${item.id}`);
      }
      await tx.insert(prescriptions).values({
        id,
        planVersionId: newVersionId,
        targetBlockId,
        exerciseVariantId: item.exerciseVariantId,
        role: item.role,
        supportsPrimaryId: null,
        sessionKey: item.sessionKey,
        plannedOrder: item.plannedOrder,
        optional: item.optional,
        sets: item.sets,
        repMin: item.repMin,
        repMax: item.repMax,
        targetReps: item.targetReps,
        targetRir: item.targetRir,
        loadMode: item.loadMode,
        weightKg: item.weightKg,
        assistanceKg: item.assistanceKg,
        addedKg: item.addedKg,
        incrementKg: item.incrementKg,
        pair: item.pair,
        sides: item.sides,
      });
    }

    for (const item of oldPrescriptions) {
      const newId = prescriptionIdMap.get(item.id);
      if (!newId) continue;
      if (item.supportsPrimaryId) {
        const supportsId = prescriptionIdMap.get(item.supportsPrimaryId);
        if (supportsId) {
          await tx
            .update(prescriptions)
            .set({ supportsPrimaryId: supportsId })
            .where(eq(prescriptions.id, newId));
        }
      }
    }

    for (const block of blocks) {
      if (!block.primaryPrescriptionId) continue;
      const newBlockId = blockIdMap.get(block.id);
      const newPrimaryId = prescriptionIdMap.get(
        block.primaryPrescriptionId,
      );
      if (newBlockId && newPrimaryId) {
        await tx
          .update(targetBlocks)
          .set({ primaryPrescriptionId: newPrimaryId })
          .where(eq(targetBlocks.id, newBlockId));
      }
    }

    const newPosteriorId = blockIdMap.get(posterior.id);
    const newHingeId = prescriptionIdMap.get(hinge.prescription.id);
    if (!newPosteriorId || !newHingeId) {
      throw new Error("Could not remap posterior chain block");
    }

    if (existingBridge) {
      const existingNewId = prescriptionIdMap.get(existingBridge.id);
      if (!existingNewId) {
        throw new Error("Could not remap existing bridge prescription");
      }
      await tx
        .update(prescriptions)
        .set({ optional: true })
        .where(eq(prescriptions.id, existingNewId));
    } else {
      await tx.insert(prescriptions).values({
        planVersionId: newVersionId,
        targetBlockId: newPosteriorId,
        exerciseVariantId: bridge.id,
        role: "ACCESSORY",
        supportsPrimaryId: newHingeId,
        sessionKey: posterior.sessionKey,
        plannedOrder: maxOrder + 1,
        optional: true,
        sets: 2,
        repMin: 8,
        repMax: 12,
        targetReps: 10,
        targetRir: 2,
        loadMode: bridge.loadMode,
        weightKg: null,
        assistanceKg: null,
        addedKg: null,
        incrementKg: bridge.incrementKg,
        pair: bridge.pair,
        sides: bridge.sides,
      });
    }

    await tx
      .update(trainingCycles)
      .set({ currentPlanVersionId: newVersionId })
      .where(eq(trainingCycles.id, cycle.id));

    await tx
      .update(sessions)
      .set({ planVersionId: newVersionId })
      .where(
        and(
          eq(sessions.cycleId, cycle.id),
          eq(sessions.status, "PLANNED"),
        ),
      );

    const pending = await tx
      .select()
      .from(recommendations)
      .where(
        and(
          eq(recommendations.cycleId, cycle.id),
          eq(recommendations.status, "PENDING"),
        ),
      );
    for (const item of pending) {
      const stored = item.candidates as
        | { changes?: Array<{ prescriptionId?: string }>; [key: string]: unknown }
        | null;
      const changes = Array.isArray(stored?.changes) ? stored.changes : [];
      await tx
        .update(recommendations)
        .set({
          candidates: {
            ...(stored ?? {}),
            changes: changes.map((change) => ({
              ...change,
              prescriptionId: change.prescriptionId
                ? (prescriptionIdMap.get(change.prescriptionId) ??
                  change.prescriptionId)
                : change.prescriptionId,
            })),
          },
          scopeId:
            prescriptionIdMap.get(item.scopeId) ??
            blockIdMap.get(item.scopeId) ??
            item.scopeId,
        })
        .where(eq(recommendations.id, item.id));
    }

    await tx.insert(auditEvents).values({
      userId,
      entity: "plan_version",
      entityId: newVersionId,
      eventType: "PLAN_VERSION_CREATED",
      payload: {
        action,
        blockKey: "posterior_chain",
        variantSlug: bridge.slug,
        decisionId,
        recommendationId,
      },
      versions: { rules: "1.0.0", plan: nextVersion },
    });
  });

  updated += 1;
}

console.info(
  JSON.stringify({ event: "bridge_migration", updated, skipped }),
);
await closeDb();
