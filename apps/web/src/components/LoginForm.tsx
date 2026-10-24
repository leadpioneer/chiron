"use client";

import { useEffect, useState, type FormEvent } from "react";
import { TelegramLoginWidget } from "./TelegramLoginWidget";

const ERRORS: Record<string, string> = {
  missing_token: "Ссылка неполная. Запросите новую.",
  expired_token: "Ссылка истекла. Запросите новую.",
  user: "Не удалось создать аккаунт. Попробуйте ещё раз.",
  account_deleted: "Этот аккаунт удалён. Восстановление недоступно.",
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
      };
    };
  }
}

export function LoginForm({
  devMode,
  initialError,
  telegramBotUsername,
}: {
  devMode: boolean;
  initialError?: string;
  telegramBotUsername: string | null;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(
    initialError ? (ERRORS[initialError] ?? "Не удалось войти.") : null,
  );
  const [devLink, setDevLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [telegramData, setTelegramData] = useState<string | null>(null);

  useEffect(() => {
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) setTelegramData(initData);
  }, []);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setDevLink(null);
    try {
      const response = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as {
        devLink?: string;
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Не удалось создать ссылку.");
        return;
      }
      setMessage(
        payload.devLink
          ? "Режим разработки: ссылка создана ниже."
          : "Ссылка отправлена на почту.",
      );
      if (payload.devLink) setDevLink(payload.devLink);
    } catch {
      setMessage("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  async function demoLogin() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/demo", { method: "POST" });
      if (!response.ok) {
        setMessage("Демо-вход недоступен.");
        return;
      }
      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  }

  async function telegramLogin() {
    if (!telegramData) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: telegramData }),
      });
      if (!response.ok) {
        setMessage("Не удалось проверить Telegram.");
        return;
      }
      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ marginTop: 20 }}>
      {telegramData ? (
        <button
          className="btn btn-primary btn-block"
          type="button"
          onClick={telegramLogin}
          disabled={loading}
        >
          Войти через Telegram
        </button>
      ) : (
        <TelegramLoginWidget botUsername={telegramBotUsername} />
      )}

      <form className="stack" onSubmit={requestLink}>
        <label className="field">
          <span className="label">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? "Создаю ссылку…" : "Получить ссылку для входа"}
        </button>
      </form>

      {devMode ? (
        <button
          className="btn btn-ghost btn-block"
          type="button"
          onClick={demoLogin}
          disabled={loading}
        >
          Демо-вход (только разработка)
        </button>
      ) : null}

      {message ? <p className="small muted">{message}</p> : null}
      {devLink ? (
        <a className="small success" href={devLink}>
          Открыть ссылку входа →
        </a>
      ) : null}
    </div>
  );
}
