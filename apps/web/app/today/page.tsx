import Link from "next/link";
import { redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { getDb, sessions, wellnessChecks } from "@chiron/db";
import { daysBetween } from "@chiron/core";
import { getCurrentUser } from "@/src/lib/auth";
import {
  getActiveCycle,
  getNextSession,
  getSessionView,
  getTemplateForCycle,
} from "@/src/lib/plan-service";
import { getPendingRecommendations } from "@/src/lib/recommendation-service";
import { formatDate, formatRange, formatWeight, todayIso } from "@/src/lib/dates";
import { StartSessionButton } from "@/src/components/StartSessionButton";
import { StartNextCycleButton } from "@/src/components/StartNextCycleButton";
import { SkipSessionButton } from "@/src/components/SkipSessionButton";
import { WeeklyCheck } from "@/src/components/WeeklyCheck";

export const metadata = { title: "Сегодня" };

export default async function TodayPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const cycle = await getActiveCycle(user.id);
  if (!cycle) redirect("/onboarding");

  const [nextSession, template, pending, wellnessRows] = await Promise.all([
    getNextSession(cycle.id),
    getTemplateForCycle(cycle.templateId),
    getPendingRecommendations(user.id),
    getDb()
      .select({
        recordedAt: wellnessChecks.recordedAt,
        createdAt: wellnessChecks.createdAt,
      })
      .from(wellnessChecks)
      .where(eq(wellnessChecks.userId, user.id))
      .orderBy(desc(wellnessChecks.createdAt))
      .limit(1),
  ]);
  const lastWellness = wellnessRows[0];
  const wellnessGap = lastWellness
    ? daysBetween(lastWellness.recordedAt, todayIso())
    : null;
  const showWeeklyCheck =
    !lastWellness || wellnessGap === null || wellnessGap >= 7;

  if (!nextSession) {
    return (
      <div>
        <p className="eyebrow">Цикл</p>
        <h1 className="page-title">Цикл завершён</h1>
        <p className="subtitle">
          Все запланированные тренировки закрыты. История и решения сохранены;
          следующий цикл можно собрать заново.
        </p>
        <div className="card">
          <div className="row-between wrap">
            <div>
              <h2 className="card-title">Что дальше</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Сейчас доступен просмотр истории и экспорт данных.
              </p>
            </div>
            {pending.length > 0 ? (
              <Link className="btn btn-primary" href="/recommendations">
                Разобрать предложения
              </Link>
            ) : null}
            <Link className="btn" href="/history">
              Открыть историю
            </Link>
            <StartNextCycleButton />
          </div>
        </div>
      </div>
    );
  }

  const view = await getSessionView(nextSession.id, user.id);
  if (!view) redirect("/today");

  const statusRows = await getDb()
    .select({ status: sessions.status, value: count() })
    .from(sessions)
    .where(eq(sessions.cycleId, cycle.id))
    .groupBy(sessions.status);
  const counts = Object.fromEntries(
    statusRows.map((row) => [row.status, Number(row.value)]),
  );
  const total = statusRows.reduce((sum, row) => sum + Number(row.value), 0);
  const completed = counts.COMPLETED ?? 0;
  const skipped = counts.SKIPPED ?? 0;
  const remaining = Math.max(0, total - completed - skipped);
  const week = Math.min(
    8,
    Math.max(
      1,
      Math.floor(
        (daysBetween(cycle.startDate, nextSession.plannedDate) ?? 0) / 7,
      ) + 1,
    ),
  );

  return (
    <div>
      <p className="eyebrow">Следующая тренировка</p>
      <h1 className="page-title">{view.session.sessionKey === "A" ? "Тяни" : "Толкай"}</h1>
      <p className="subtitle">
        {formatDate(nextSession.plannedDate)} · цикл{" "}
        {template?.name ?? "Тяни / Толкай"}.
      </p>

      {nextSession.plannedDate < todayIso() ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          Плановая дата этой тренировки уже прошла. Начните её или пропустите;
          цикл не переставляет сессии автоматически.
        </div>
      ) : null}

      <section className="card hero">
        <div className="row-between wrap">
          <div>
            <span className="badge badge-primary">Неделя {week} из 8</span>
            <div className="hero-title">
              {view.blocks.length} блока · {view.blocks.reduce((sum, block) => sum + block.prescriptions.length, 0)} упражнения
            </div>
            <p className="small muted" style={{ margin: "8px 0 0", maxWidth: 540 }}>
              Основные движения прогрессируют независимо. Подсобка необязательна
              и не подтягивает вес основного.
            </p>
          </div>
          <div className="row wrap" style={{ alignItems: "stretch" }}>
            <StartSessionButton
              sessionId={nextSession.id}
              inProgress={nextSession.status === "IN_PROGRESS"}
            />
            {nextSession.status === "PLANNED" ? (
              <SkipSessionButton sessionId={nextSession.id} />
            ) : null}
          </div>
        </div>
        <div className="stat-row">
          <div className="stat">
            <div className="stat-value">{completed}</div>
            <div className="stat-label">Завершено</div>
          </div>
          <div className="stat">
            <div className="stat-value">{remaining}</div>
            <div className="stat-label">В плане</div>
          </div>
          <div className="stat">
            <div className="stat-value">{skipped}</div>
            <div className="stat-label">Пропущено</div>
          </div>
          <div className="stat">
            <div className="stat-value">{pending.length}</div>
            <div className="stat-label">Решений</div>
          </div>
        </div>
      </section>

      {showWeeklyCheck ? <WeeklyCheck /> : null}

      {pending.length > 0 ? (
        <section className="card">
          <div className="row-between wrap">
            <div>
              <h2 className="card-title">Есть предложения</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Изменения не вступят в силу, пока вы их не подтвердите.
              </p>
            </div>
            <Link className="btn btn-primary" href="/recommendations">
              Разобрать {pending.length}
            </Link>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">План на сессию</h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              Порядок можно менять в зале; роли и связи сохраняются.
            </p>
          </div>
        </div>
        {view.blocks.map((block) => (
          <div className="block" key={block.id}>
            <div className="block-head">
              <div>
                <div className="block-name">{block.name}</div>
                <div className="tiny muted">{block.goal}</div>
              </div>
            </div>
            <div className="stack">
              {block.prescriptions.map((item) => (
                <div
                  className={`exercise${item.role === "PRIMARY" ? " primary" : ""}`}
                  key={item.id}
                >
                  <div className="exercise-head">
                    <div>
                      <div className="exercise-name">{item.exerciseName}</div>
                      <div className="exercise-target">{item.variantName}</div>
                    </div>
                    <span
                      className={
                        item.role === "PRIMARY"
                          ? "badge badge-primary"
                          : "badge badge-accessory"
                      }
                    >
                      {item.role === "PRIMARY" ? "PRIMARY" : item.role}
                    </span>
                  </div>
                  <div className="exercise-meta">
                    <span className="tiny muted">
                      {item.sets} × {formatRange(item.repMin, item.repMax)} ·
                      цель {item.targetReps} · RIR {item.targetRir}
                    </span>
                    <span className="tiny muted">
                      {item.loadMode === "ASSISTED"
                        ? `помощь ${formatWeight(item.assistanceKg, { unit: "кг" })}`
                        : item.loadMode === "BODYWEIGHT_PLUS"
                          ? `доп. ${formatWeight(item.addedKg, { unit: "кг" })}`
                          : item.loadMode === "BODYWEIGHT"
                            ? "собственный вес"
                            : formatWeight(item.weightKg, { unit: "кг" })}
                    </span>
                    {item.optional ? (
                      <span className="badge">необязательно</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
