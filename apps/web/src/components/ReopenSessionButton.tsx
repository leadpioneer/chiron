"use client";

import { useState } from "react";

export function ReopenSessionButton({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reopen() {
    if (
      !window.confirm(
        "Вернуть тренировку в работу? Незавершённые предложения будут отменены, после исправления тренировку нужно завершить заново.",
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/reopen`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось вернуть тренировку в работу.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Сеть недоступна.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <button
        className="btn btn-sm"
        type="button"
        onClick={reopen}
        disabled={loading}
      >
        {loading ? "Возвращаю…" : "Исправить запись"}
      </button>
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}
