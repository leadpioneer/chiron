"use client";

import { useState } from "react";

export function SubjectSwitchButton({
  menteeUserId,
  label,
  className = "btn btn-primary",
}: {
  menteeUserId: string;
  label: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/subject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ menteeUserId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось переключить дневник.");
        setLoading(false);
        return;
      }
      window.location.assign("/today");
    } catch {
      setError("Сеть недоступна.");
      setLoading(false);
    }
  }

  return (
    <form
      action="/api/subject"
      method="post"
      onSubmit={submit}
      className="stack"
      style={{ gap: 6 }}
    >
      <input type="hidden" name="menteeUserId" value={menteeUserId} />
      <button className={className} type="submit" disabled={loading}>
        {loading ? "Открываю…" : label}
      </button>
      {error ? <span className="error">{error}</span> : null}
    </form>
  );
}
