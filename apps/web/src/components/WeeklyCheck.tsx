"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WeeklyCheck() {
  const router = useRouter();
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [motivation, setMotivation] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<
    "NONE" | "LOCAL" | "SEVERE" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected =
    sleepQuality !== null ||
    stress !== null ||
    motivation !== null ||
    soreness !== null;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/wellness", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sleepHours: null,
          sleepQuality,
          fatigue: null,
          stress,
          motivation,
          soreness,
          symptom: false,
          symptomText: null,
          illness: "NONE",
        }),
      });
      if (!response.ok) {
        setMessage("Не удалось сохранить.");
        return;
      }
      setMessage("Сохранено.");
      router.refresh();
    } catch {
      setMessage("Сеть недоступна.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Недельный чек-ин</h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            Четыре необязательных вопроса. Они помогают не повышать нагрузку
            вслепую.
          </p>
        </div>
        {message ? <span className="tiny success">{message}</span> : null}
      </div>

      <div className="grid grid-2">
        <div className="field">
          <span className="label">Качество сна</span>
          <div className="chip-row">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`chip${sleepQuality === value ? " active" : ""}`}
                onClick={() =>
                  setSleepQuality((current) =>
                    current === value ? null : value,
                  )
                }
                disabled={busy}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Стресс</span>
          <div className="chip-row">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`chip${stress === value ? " active" : ""}`}
                onClick={() =>
                  setStress((current) => (current === value ? null : value))
                }
                disabled={busy}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Мотивация</span>
          <div className="chip-row">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`chip${motivation === value ? " active" : ""}`}
                onClick={() =>
                  setMotivation((current) =>
                    current === value ? null : value,
                  )
                }
                disabled={busy}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Болезненность</span>
          <div className="chip-row">
            {(
              [
                ["NONE", "нет"],
                ["LOCAL", "локальная"],
                ["SEVERE", "выраженная"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`chip${soreness === value ? " active" : ""}`}
                onClick={() =>
                  setSoreness((current) => (current === value ? null : value))
                }
                disabled={busy}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        className="btn btn-sm"
        type="button"
        onClick={save}
        disabled={busy || !selected}
        style={{ marginTop: 12 }}
      >
        {busy ? "Сохраняю…" : "Сохранить чек-ин"}
      </button>
    </section>
  );
}
