"use client";

import { useState } from "react";

export function SkipSessionButton({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function skip() {
    if (!window.confirm("Пропустить эту тренировку? Она останется в цикле как пропущенная.")) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/skip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "NO_TIME", comment: null }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Не удалось пропустить тренировку.");
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
    <div className="stack">
      <button
        className="btn btn-ghost"
        type="button"
        onClick={skip}
        disabled={loading}
      >
        {loading ? "Пропускаю…" : "Пропустить"}
      </button>
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}
