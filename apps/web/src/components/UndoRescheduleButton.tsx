"use client";

import { useState } from "react";
import { formatDate } from "@/src/lib/dates";

export function UndoRescheduleButton({
  sessionId,
  from,
  to,
}: {
  sessionId: string;
  from: string;
  to: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    if (
      !window.confirm(
        `Вернуть тренировку на ${formatDate(from)}? Перенос на ${formatDate(to)} будет отменён.`,
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/reschedule/undo`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось отменить перенос.");
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
    <div className="stack" style={{ gap: 6 }}>
      <button
        className="btn btn-ghost btn-sm"
        type="button"
        onClick={undo}
        disabled={loading}
      >
        {loading ? "Отменяю…" : "Отменить перенос"}
      </button>
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}
