"use client";

import { useState } from "react";
import { addDaysIso, formatDate } from "@/src/lib/dates";

type RescheduleMode = "SINGLE" | "SHIFT_TAIL";

const MODE_EXPLANATIONS: Record<RescheduleMode, string> = {
  SINGLE:
    "Меняется только эта тренировка. Назначения и версия плана не меняются. Если новая дата совпадёт со следующей тренировкой, потребуется сдвинуть хвост.",
  SHIFT_TAIL:
    "Эта и все последующие запланированные тренировки сдвинутся на одинаковую дельту. Конец цикла сдвинется, но не больше чем на 14 дней.",
};

export function RescheduleSessionButton({
  sessionId,
  currentDate,
  today,
  cycleEndDate,
}: {
  sessionId: string;
  currentDate: string;
  today: string;
  cycleEndDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() =>
    currentDate > today ? currentDate : addDaysIso(today, 1),
  );
  const [mode, setMode] = useState<RescheduleMode>("SINGLE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const maxDate = addDaysIso(cycleEndDate, 14);

  function openModal() {
    setDate(currentDate > today ? currentDate : addDaysIso(today, 1));
    setMode("SINGLE");
    setError(null);
    setConflict(false);
    setOpen(true);
  }

  async function submit(nextMode: RescheduleMode = mode) {
    setLoading(true);
    setError(null);
    setConflict(false);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/reschedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newDate: date, mode: nextMode }),
      });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось перенести тренировку.");
        setConflict(payload.code === "ORDER_CONFLICT");
        return;
      }
      window.location.href = "/today";
    } catch {
      setError("Сеть недоступна.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="btn" type="button" onClick={openModal}>
        Отложить
      </button>

      {open ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Перенос тренировки"
          onClick={(event) => {
            if (event.target === event.currentTarget && !loading) setOpen(false);
          }}
        >
          <div className="modal">
            <h2 className="card-title" style={{ fontSize: 22 }}>
              Отложить тренировку
            </h2>
            <p className="small muted">
              Сейчас запланирована на {formatDate(currentDate)}. Перенос не меняет
              упражнения и не создаёт новую версию плана.
            </p>

            <label className="field" style={{ marginTop: 14 }}>
              <span className="label">Новая дата</span>
              <input
                className="input"
                type="date"
                min={today}
                max={maxDate}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setConflict(false);
                  setError(null);
                }}
                disabled={loading}
              />
            </label>

            <div className="field" style={{ marginTop: 14 }}>
              <span className="label">Что сдвинуть</span>
              <div className="stack" style={{ gap: 8 }}>
                {(
                  [
                    ["SINGLE", "Только эту тренировку"],
                    ["SHIFT_TAIL", "Эту и все следующие"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`scheme-option${mode === value ? " active" : ""}`}
                    onClick={() => {
                      setMode(value);
                      setConflict(false);
                      setError(null);
                    }}
                    disabled={loading}
                  >
                    <span className="scheme-title">{label}</span>
                    <span className="tiny muted">
                      {MODE_EXPLANATIONS[value]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <p className="tiny muted" style={{ marginTop: 12 }}>
              Последняя допустимая дата: {formatDate(maxDate)}. Дальше — только
              пересмотр цикла.
            </p>

            {error ? (
              <p className="error" style={{ marginTop: 10 }}>
                {error}
              </p>
            ) : null}

            {conflict ? (
              <div className="notice" style={{ marginTop: 10 }}>
                <p style={{ margin: 0 }}>
                  Эта дата пересекается со следующей тренировкой. Можно сдвинуть
                  текущую и все последующие сессии.
                </p>
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  style={{ marginTop: 10 }}
                  onClick={() => {
                    setMode("SHIFT_TAIL");
                    void submit("SHIFT_TAIL");
                  }}
                  disabled={loading}
                >
                  Сдвинуть оставшиеся
                </button>
              </div>
            ) : null}

            <div className="row-between" style={{ marginTop: 18 }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Отмена
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => submit()}
                disabled={loading || date === ""}
              >
                {loading ? "Переношу…" : "Перенести"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
