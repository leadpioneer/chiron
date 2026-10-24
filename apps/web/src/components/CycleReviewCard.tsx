"use client";

import { useState } from "react";
import { formatDate } from "@/src/lib/dates";

type ReviewReason = "LONG_PAUSE" | "ILLNESS" | "USER";

export function CycleReviewCard({
  cycleId,
  reason,
  pauseDays,
  lastTrainingDate,
  safety,
}: {
  cycleId: string;
  reason: ReviewReason;
  pauseDays: number;
  lastTrainingDate: string | null;
  safety: boolean;
}) {
  const [busy, setBusy] = useState<"REBUILD" | "STOP" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const manual = reason === "USER";

  async function submit(action: "REBUILD" | "STOP") {
    if (
      action === "STOP" &&
      !window.confirm(
        "Завершить цикл? Он закроется, и вы перейдёте в онбординг для нового цикла.",
      )
    ) {
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/cycles/${cycleId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось пересмотреть цикл.");
        return;
      }
      window.location.href = action === "REBUILD" ? "/today" : "/onboarding";
    } catch {
      setError("Сеть недоступна.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card hero" id="cycle-review">
      <div className="card-head">
        <div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="badge badge-warning">
              {manual ? "ручной пересмотр" : "Цикл нужно пересмотреть"}
            </span>
            <span className="badge">
              {manual ? "по вашему запросу" : `пауза ${pauseDays} дн.`}
            </span>
          </div>
          <h2 className="card-title" style={{ marginTop: 10 }}>
            {manual
              ? "Пересмотреть цикл вручную"
              : "Продолжить старый цикл нельзя автоматически"}
          </h2>
          <p className="small muted" style={{ margin: "4px 0 0", maxWidth: 620 }}>
            {lastTrainingDate
              ? `Последняя завершённая тренировка: ${formatDate(lastTrainingDate)}.`
              : "Завершённых тренировок в этом цикле ещё не было."}{" "}
            {manual
              ? "Вы запросили пересмотр. Текущий цикл закроется; новый начнётся с теми же упражнениями и с 4 сессиями возвращения."
              : "Выберите, что сделать с циклом. Нагрузки и прогрессия не меняются без вашего решения."}
          </p>
        </div>
      </div>

      {safety ? (
        <div className="notice notice-red" style={{ marginBottom: 12 }}>
          <strong>Сигнал безопасности.</strong> Пересборка не заменяет
          медицинскую оценку. Если есть боль в груди, обморок, выраженная одышка
          или неврологические симптомы, обратитесь за неотложной помощью.
        </div>
      ) : null}

      <div className="grid grid-2">
        <div className="exercise">
          <div className="exercise-name">Пересобрать цикл</div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            Старый цикл закроется как остановленный. Новый цикл — 8 недель с теми
            же упражнениями и подсобкой. Нагрузки будут снижены по правилам
            возвращения, первые 4 сессии — возвратные.
          </p>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => submit("REBUILD")}
            disabled={busy !== null}
            style={{ marginTop: 12 }}
          >
            {busy === "REBUILD" ? "Пересобираю…" : "Пересобрать цикл"}
          </button>
        </div>
        <div className="exercise">
          <div className="exercise-name">Завершить цикл</div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            Цикл закроется без нового плана. История и audit сохранятся, затем
            откроется онбординг для ручной сборки нового цикла.
          </p>
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => submit("STOP")}
            disabled={busy !== null}
            style={{ marginTop: 12 }}
          >
            {busy === "STOP" ? "Завершаю…" : "Завершить цикл"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="error" style={{ marginTop: 10 }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
