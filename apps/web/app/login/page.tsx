import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { authDevModeEnabled } from "@/src/lib/config";
import { LoginForm } from "@/src/components/LoginForm";

export const metadata = { title: "Вход" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { error } = await searchParams;
  const devMode = authDevModeEnabled();

  return (
    <div className="login">
      <section className="login-card card">
        <div className="login-brand">
          <span className="brand-mark">C</span>
          <span className="eyebrow">Chiron</span>
        </div>
        <h1 className="login-title">Сила без догадок.</h1>
        <p className="subtitle">
          Дневник, который помнит план, считает факт и объясняет каждое
          изменение. Вы подтверждаете решение — приложение не меняет программу
          само.
        </p>
        <LoginForm
          devMode={devMode}
          initialError={error}
          telegramBotUsername={
            process.env.TELEGRAM_BOT_USERNAME?.trim() || null
          }
        />
        <div className="divider" />
        <p className="tiny muted" style={{ margin: 0 }}>
          Некоммерческий проект. Без рекламы, коммерческой аналитики и продажи
          данных. Данные обрабатываются минимально для работы дневника.
          Wellness-инструмент. Не диагностирует и не заменяет врача или тренера.
        </p>
      </section>
    </div>
  );
}
