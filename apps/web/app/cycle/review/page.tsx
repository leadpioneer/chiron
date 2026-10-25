import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSubject } from "@/src/lib/subject";
import { getActiveCycle } from "@/src/lib/plan-service";
import { getPauseStateForUser } from "@/src/lib/return-service";
import { toCycleReviewState } from "@/src/lib/cycle-review-service";
import { CycleReviewCard } from "@/src/components/CycleReviewCard";

export const metadata = { title: "Пересмотр цикла" };

export default async function CycleReviewPage() {
  const { subject } = await requireSubject();
  const cycle = await getActiveCycle(subject.id);
  if (!cycle) redirect("/onboarding");

  const pause = await getPauseStateForUser(subject.id, cycle);
  const state = toCycleReviewState(pause);
  const reason = state.required ? state.reason : "USER";

  return (
    <div>
      <Link href="/today" className="btn btn-ghost">
        ← Сегодня
      </Link>
      <p className="eyebrow" style={{ marginTop: 14 }}>
        Цикл
      </p>
      <h1 className="page-title">Пересмотр цикла</h1>
      <p className="subtitle">
        Ручной пересмотр закрывает текущий цикл и создаёт новый. Это не отмена
        отдельной тренировки: история, версии и audit сохранятся.
      </p>
      <CycleReviewCard
        cycleId={cycle.id}
        reason={reason}
        pauseDays={state.pauseDays}
        lastTrainingDate={state.lastTrainingDate}
        safety={state.safety}
      />
    </div>
  );
}
