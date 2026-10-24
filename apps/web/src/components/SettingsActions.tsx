"use client";

import { useState } from "react";

export function SettingsActions() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Не удалось удалить аккаунт.");
        return;
      }
      window.location.href = "/login";
    } catch {
      setError("Сеть недоступна.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row wrap">
        <a className="btn" href="/api/account/export">
          Скачать JSON
        </a>
        <button className="btn btn-ghost" type="button" onClick={logout} disabled={busy}>
          Выйти
        </button>
      </div>

      <div className="divider" />

      {confirming ? (
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>
            Аккаунт будет анонимизирован, входы отключены, данные удалены в
            течение 30 дней. Это действие нельзя отменить.
          </p>
          <div className="row wrap">
            <button
              className="btn btn-danger"
              type="button"
              onClick={removeAccount}
              disabled={busy}
            >
              {busy ? "Удаляю…" : "Удалить навсегда"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
        >
          Удалить аккаунт
        </button>
      )}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
