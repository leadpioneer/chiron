"use client";

import { useState } from "react";

export function StartNextCycleButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cycles/next", { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Не удалось начать следующий цикл.");
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
        className="btn btn-primary"
        type="button"
        onClick={start}
        disabled={loading}
      >
        {loading ? "Создаю цикл…" : "Начать следующий цикл"}
      </button>
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}
