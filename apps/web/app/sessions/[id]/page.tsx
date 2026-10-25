import { notFound, redirect } from "next/navigation";
import type { LoadMode } from "@chiron/contracts";
import { getCurrentUser } from "@/src/lib/auth";
import { getSessionView } from "@/src/lib/plan-service";
import { todayIso } from "@/src/lib/dates";
import { SessionLogger } from "@/src/components/SessionLogger";

export const metadata = { title: "Тренировка" };

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const view = await getSessionView(id, user.id);
  if (!view) notFound();

  const clientView = {
    today: todayIso(),
    cycleStartDate: view.cycle.startDate,
    session: {
      id: view.session.id,
      sessionKey: view.session.sessionKey,
      plannedDate: view.session.plannedDate,
      actualDate: view.session.actualDate,
      status: view.session.status,
      isReturn: view.session.isReturn,
    },
    blocks: view.blocks.map((block) => ({
      id: block.id,
      key: block.key,
      name: block.name,
      goal: block.goal,
      prescriptions: block.prescriptions.map((item) => ({
        id: item.id,
        exerciseVariantId: item.exerciseVariantId,
        exerciseName: item.exerciseName,
        variantName: item.variantName,
        role: item.role,
        targetBlockKey: item.targetBlockKey,
        targetBlockName: item.targetBlockName,
        supportsPrimaryId: item.supportsPrimaryId,
        optional: item.optional,
        sets: item.sets,
        repMin: item.repMin,
        repMax: item.repMax,
        targetReps: item.targetReps,
        targetRir: item.targetRir,
        loadMode: item.loadMode as LoadMode,
        weightKg: item.weightKg,
        assistanceKg: item.assistanceKg,
        addedKg: item.addedKg,
        incrementKg: item.incrementKg,
        pair: item.pair,
        sides: item.sides,
        lastSets: item.lastSets,
        technique: item.technique,
      })),
    })),
    sets: view.sets.map((set) => ({
      clientSetId: set.clientSetId,
      prescriptionId: set.prescriptionId,
      actualOrder: set.actualOrder,
      setType: set.setType,
      weightKg: set.weightKg,
      assistanceKg: set.assistanceKg,
      addedKg: set.addedKg,
      reps: set.reps,
      rir: set.rir,
      technique: set.technique,
      pain: set.pain,
      completed: set.completed,
    })),
  };

  return <SessionLogger view={clientView} />;
}
