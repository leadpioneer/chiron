import Link from "next/link";
import { requireSubject } from "@/src/lib/subject";
import { getHistory, type ExerciseHistory } from "@/src/lib/history-service";
import { formatDateShort, formatWeight } from "@/src/lib/dates";

export const metadata = { title: "История" };

const AUDIT_LABELS: Record<string, string> = {
  CYCLE_CREATED: "Цикл создан",
  CYCLE_CLOSED: "Цикл закрыт",
  CYCLE_REVIEWED: "Цикл пересмотрен",
  CYCLE_REBUILT: "Цикл пересобран",
  SESSION_STARTED: "Тренировка начата",
  SESSION_COMPLETED: "Тренировка завершена",
  RECOMMENDATIONS_REGENERATED: "Рекомендации пересозданы",
  SESSION_SKIPPED: "Тренировка пропущена",
  SESSION_RESCHEDULED: "Тренировка перенесена",
  SESSION_RESCHEDULE_UNDONE: "Перенос отменён",
  SESSION_REOPENED: "Тренировка возвращена в работу",
  SET_DELETED: "Подход удалён",
  EXERCISE_SKIPPED: "Упражнение убрано из тренировки",
  MENTEE_CREATED: "Создан подопечный",
  MENTEE_LINKED: "Подопечный привязан",
  MENTEE_REVOKED: "Доступ к подопечному отозван",
  PLAN_VERSION_CREATED: "Новая версия плана",
  RECOMMENDATION_REJECTED: "Рекомендация отклонена",
  RECOMMENDATION_ACCEPTED_NO_CHANGE: "Рекомендация принята",
  SAFETY_ACKNOWLEDGED: "Сигнал безопасности подтверждён",
  RETURN_PREPARED: "Подготовлено возвращение",
};

function auditDetail(event: {
  eventType: string;
  payload: unknown;
}): string | null {
  const payload = event.payload as
    | { from?: unknown; to?: unknown; mode?: unknown; movedSessions?: unknown }
    | null;
  if (
    (event.eventType === "SESSION_RESCHEDULED" ||
      event.eventType === "SESSION_RESCHEDULE_UNDONE") &&
    typeof payload?.from === "string" &&
    typeof payload?.to === "string"
  ) {
    const mode =
      payload.mode === "SHIFT_TAIL"
        ? ` · сдвиг хвоста (${String(payload.movedSessions ?? "")} сессий)`
        : "";
    return `${payload.from} → ${payload.to}${mode}`;
  }
  return null;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const width = 280;
  const height = 78;
  const padding = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x =
      values.length === 1
        ? width / 2
        : padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return { x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Динамика нагрузки"
    >
      <line
        className="chart-grid"
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
      />
      {values.length > 1 ? (
        <>
          <polygon className="chart-area" points={area} />
          <polyline className="chart-line" points={line} />
        </>
      ) : null}
      {points.map((point, index) => (
        <circle
          key={index}
          className="chart-dot"
          cx={point.x}
          cy={point.y}
          r={3}
        />
      ))}
    </svg>
  );
}

function loadText(exercise: ExerciseHistory, exposure: ExerciseHistory["exposures"][number]): string {
  if (exercise.loadMode === "BODYWEIGHT") return "свой вес";
  if (exercise.loadMode === "ASSISTED") {
    const assistance = exposure.sets.find((set) => set.assistanceKg !== null)
      ?.assistanceKg;
    return assistance === null || assistance === undefined
      ? "—"
      : `${formatWeight(assistance, { unit: "кг" })} помощи`;
  }
  if (exercise.loadMode === "BODYWEIGHT_PLUS") {
    const added = exposure.sets.find((set) => set.addedKg !== null)?.addedKg;
    return added === null || added === undefined
      ? "—"
      : `+${formatWeight(added, { unit: "кг" })}`;
  }
  return formatWeight(exposure.bestLoadKg, { unit: "кг" });
}

export default async function HistoryPage() {
  const { subject } = await requireSubject();
  const history = await getHistory(subject.id);
  const sessionIds = new Set(
    history.exercises.flatMap((exercise) =>
      exercise.exposures.map((exposure) => exposure.sessionId),
    ),
  );

  return (
    <div>
      <p className="eyebrow">Прогресс</p>
      <h1 className="page-title">История</h1>
      <p className="subtitle">
        Каждое упражнение считается отдельно. Тоннаж разных упражнений не
        складывается в общий балл.
      </p>

      <div className="grid grid-3">
        <div className="stat">
          <div className="stat-value">{sessionIds.size}</div>
          <div className="stat-label">Тренировок</div>
        </div>
        <div className="stat">
          <div className="stat-value">{history.exercises.length}</div>
          <div className="stat-label">Упражнений</div>
        </div>
        <div className="stat">
          <div className="stat-value">{history.decisions.length}</div>
          <div className="stat-label">Решений</div>
        </div>
      </div>

      {history.exercises.length === 0 ? (
        <div className="empty" style={{ marginTop: 16 }}>
          <p style={{ marginTop: 0 }}>Пока нет завершённых тренировок.</p>
          <Link className="btn btn-primary" href="/today">
            К тренировке
          </Link>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          {history.exercises.map((exercise) => {
            const chronological = [...exercise.exposures].reverse();
            const values = chronological
              .map((exposure) => exposure.bestLoadKg)
              .filter((value): value is number => value !== null);
            const latest = exercise.exposures[0];
            return (
              <section className="card" key={exercise.variantId}>
                <div className="card-head">
                  <div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <span
                        className={
                          exercise.role === "PRIMARY"
                            ? "badge badge-primary"
                            : "badge badge-accessory"
                        }
                      >
                        {exercise.role}
                      </span>
                      <span className="badge">{exercise.variantName}</span>
                    </div>
                    <h2 className="card-title" style={{ marginTop: 8 }}>
                      {exercise.exerciseName}
                    </h2>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="stat-value">{latest?.reps ?? 0}</div>
                    <div className="stat-label">повторов в последней</div>
                  </div>
                </div>

                <Sparkline values={values.length > 0 ? values : chronological.map((item) => item.reps)} />

                <div className="stack">
                  {exercise.exposures.slice(0, 5).map((exposure) => (
                    <div
                      className="row-between"
                      key={exposure.sessionId}
                      style={{
                        borderTop: "1px solid var(--line-soft)",
                        paddingTop: 9,
                      }}
                    >
                      <span className="small muted">
                        {formatDateShort(exposure.date)}
                      </span>
                      <span className="small">
                        {loadText(exercise, exposure)}
                      </span>
                      <span className="small">
                        {exposure.workingSets} × {exposure.reps} повт.
                      </span>
                      <span className="small muted">
                        {exposure.tonnageKg === null
                          ? "тоннаж —"
                          : `${Math.round(exposure.tonnageKg)} кг`}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">Решения</h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              Что менялось, когда и по какой причине.
            </p>
          </div>
        </div>
        {history.decisions.length === 0 ? (
          <p className="small muted">Решений пока нет.</p>
        ) : (
          <div className="timeline">
            {history.decisions.map((decision) => (
              <div className="timeline-item" key={decision.id}>
                <div className="row-between wrap">
                  <strong className="small">
                    {decision.action} · {decision.outcome}
                  </strong>
                  <span className="tiny muted">
                    {new Date(decision.createdAt).toLocaleDateString("ru-RU")}
                  </span>
                </div>
                <p className="tiny muted" style={{ margin: "4px 0 0" }}>
                  {decision.explanation}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">Журнал изменений</h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              Audit-события: создание цикла, завершение, версии плана и решения.
            </p>
          </div>
        </div>
        {history.audit.length === 0 ? (
          <p className="small muted">Событий пока нет.</p>
        ) : (
          <div className="timeline">
            {history.audit.map((event) => {
              const detail = auditDetail(event);
              return (
                <div className="timeline-item" key={event.id}>
                  <div className="row-between wrap">
                    <strong className="small">
                      {AUDIT_LABELS[event.eventType] ?? event.eventType}
                    </strong>
                    <span className="tiny muted">
                      {new Date(event.createdAt).toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <p className="tiny muted" style={{ margin: "4px 0 0" }}>
                    {detail ? `${detail} · ` : ""}
                    {event.entity}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
