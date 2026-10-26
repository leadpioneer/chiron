"use client";

import { useState } from "react";

export function SkipExerciseButton({
  sessionId,
  prescriptionId,
  exerciseName,
}: {
  sessionId: string;
  prescriptionId: string;
  exerciseName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function skip() {
    if (!window.confirm(`Убрать «${exerciseName}» из этой тренировки?`)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/exercises/${prescriptionId}/skip`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось убрать упражнение.");
        setLoading(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Сеть недоступна.");
      setLoading(false);
    }
  }

  return (
    <span className="stack" style={{ gap: 4 }}>
      <button
        className="mini-toggle"
        type="button"
        onClick={skip}
        disabled={loading}
      >
        {loading ? "убираю…" : "убрать"}
      </button>
      {error ? <span className="error">{error}</span> : null}
    </span>
  );
}
