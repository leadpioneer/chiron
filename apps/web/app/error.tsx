"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="empty" style={{ marginTop: 40 }}>
      <h1 className="page-title" style={{ fontSize: 28 }}>
        Что-то пошло не так
      </h1>
      <p>
        Данные не изменены. Попробуйте обновить страницу; если ошибка
        повторяется, проверьте подключение к базе.
      </p>
      <button className="btn btn-primary" type="button" onClick={reset}>
        Повторить
      </button>
    </div>
  );
}
