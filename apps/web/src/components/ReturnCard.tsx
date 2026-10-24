"use client";

import { useState } from "react";
import type { ReturnPreview } from "@/src/lib/return-service";
import { formatWeight } from "@/src/lib/dates";

function loadText(
  loadMode: string,
  load: {
    weightKg: number | null;
    assistanceKg: number | null;
    addedKg: number | null;
  },
): string {
  if (loadMode === "ASSISTED") {
    return `${formatWeight(load.assistanceKg, { unit: "кг" })} помощи`;
  }
  if (loadMode === "BODYWEIGHT_PLUS") {
    return `+${formatWeight(load.addedKg, { unit: "кг" })}`;
  }
  if (loadMode === "BODYWEIGHT") return "свой вес";
  return formatWeight(load.weightKg, { unit: "кг" });
}

export function ReturnCard({ preview }: { preview: ReturnPreview }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/sessions/${preview.sessionId}/return`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось подготовить возвращение.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Сеть недоступна.");
    } finally {
      setLoading(false);
    }
  }

  const rirText =
    preview.targetRirs.length > 1
      ? `RIR ${preview.targetRirs.join(", затем ")}`
      : `RIR ${preview.targetRirs[0] ?? 3}`;

  return (
    <section className="card" id="return">
      <div className="card-head">
        <div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="badge badge-primary">Возвращение</span>
            <span className="badge">после паузы {preview.days} дн.</span>
          </div>
          <h2 className="card-title" style={{ marginTop: 10 }}>
            Подготовить возвращение
          </h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            Без автоматического повышения. Нагрузка снижается только для{" "}
            {preview.sessions === 1 ? "одной сессии" : "двух следующих сессий"} и
            останется новой базой. Упражнения и роли не меняются.
          </p>
        </div>
      </div>

      <div className="stack">
        {preview.items.map((item) => (
          <div className="diff" key={item.prescriptionId}>
            <span className="diff-before">
              {loadText(item.loadMode, item.before)}
            </span>
            <span className="diff-arrow">→</span>
            <span className="diff-after">
              {loadText(item.loadMode, item.after)}
            </span>
            <span className="tiny muted" style={{ gridColumn: "1 / -1" }}>
              {item.exerciseName} · {item.variantName} · {item.role}
            </span>
          </div>
        ))}
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-value">{rirText}</div>
          <div className="stat-label">Целевой RIR</div>
        </div>
        <div className="stat">
          <div className="stat-value">{preview.sessions}</div>
          <div className="stat-label">
            {preview.sessions === 1 ? "сессия" : "сессии"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-value">HOLD</div>
          <div className="stat-label">Прогрессия</div>
        </div>
      </div>

      <p className="tiny muted" style={{ marginTop: 12 }}>
        Прогрессия заблокирована на {preview.sessions}{" "}
        {preview.sessions === 1 ? "сессию" : "сессии"}. Это не разгрузка и не
        новая программа: изменится только нагрузка и целевой RIR, с решением и
        audit.
      </p>

      {error ? (
        <p className="error" style={{ marginTop: 10 }}>
          {error}
        </p>
      ) : null}

      <button
        className="btn btn-primary"
        type="button"
        onClick={prepare}
        disabled={loading}
        style={{ marginTop: 14 }}
      >
        {loading ? "Готовлю…" : "Подготовить возвращение"}
      </button>
    </section>
  );
}
