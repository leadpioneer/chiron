"use client";

import { useState } from "react";

export function RemoveExerciseButton({
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

  async function remove() {
    if (
      !window.confirm(
        `Удалить «${exerciseName}» из плана этой тренировки и будущих дней того же типа?`,
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/exercises/${prescriptionId}/remove`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось удалить упражнение.");
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
        onClick={remove}
        disabled={loading}
      >
        {loading ? "удаляю…" : "удалить из плана"}
      </button>
      {error ? <span className="error">{error}</span> : null}
    </span>
  );
}
