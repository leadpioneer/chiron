"use client";

import { useEffect } from "react";

export function TelegramBoot() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
  }, []);
  return null;
}
