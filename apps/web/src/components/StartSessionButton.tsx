"use client";

import { useState } from "react";

export function StartSessionButton({
  sessionId,
  inProgress,
}: {
  sessionId: string;
  inProgress: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/start`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Не удалось начать тренировку.");
        return;
      }
      window.location.href = `/sessions/${sessionId}`;
    } catch {
      setError("Сеть недоступна.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ minWidth: 190 }}>
      <button
        className="btn btn-primary btn-block"
        type="button"
        onClick={start}
        disabled={loading}
      >
        {loading ? "Открываю…" : inProgress ? "Продолжить" : "Начать тренировку"}
      </button>
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}
