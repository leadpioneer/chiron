"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string>) => void;
  }
}

export function TelegramLoginWidget({
  botUsername,
}: {
  botUsername: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!botUsername || !container.current) return;
    const node = container.current;

    window.onTelegramAuth = async (user) => {
      setMessage(null);
      try {
        const response = await fetch("/api/auth/telegram/widget", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ params: user }),
        });
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          setMessage(payload.error ?? "Не удалось войти через Telegram.");
          return;
        }
        window.location.href = "/";
      } catch {
        setMessage("Сеть недоступна. Попробуйте ещё раз.");
      }
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    node.appendChild(script);

    return () => {
      script.remove();
      delete window.onTelegramAuth;
    };
  }, [botUsername]);

  if (!botUsername) return null;

  return (
    <div className="stack" style={{ alignItems: "center" }}>
      <div ref={container} />
      {message ? <p className="small muted">{message}</p> : null}
    </div>
  );
}
