import Link from "next/link";
import { eq } from "drizzle-orm";
import { athleteProfiles, getDb } from "@chiron/db";
import { requireSubject } from "@/src/lib/subject";
import { getActiveCycle } from "@/src/lib/plan-service";
import { formatDate } from "@/src/lib/dates";
import { SettingsActions } from "@/src/components/SettingsActions";

export const metadata = { title: "Настройки" };

const EXPERIENCE_LABELS: Record<string, string> = {
  BEGINNER: "Начинаю",
  RETURNING: "Возвращаюсь",
  INTERMEDIATE: "Уже тренируюсь",
};

const GOAL_LABELS: Record<string, string> = {
  STRENGTH: "Сила",
  AESTHETIC: "Эстетика",
  BOTH: "Сила и эстетика",
};

export default async function SettingsPage() {
  const { subject, isSelf } = await requireSubject();
  const cycle = await getActiveCycle(subject.id);
  const profileRows = await getDb()
    .select()
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, subject.id))
    .limit(1);
  const profile = profileRows[0];

  return (
    <div>
      <p className="eyebrow">{isSelf ? "Аккаунт" : "Подопечный"}</p>
      <h1 className="page-title">Настройки</h1>
      <p className="subtitle">
        {isSelf
          ? "Данные принадлежат вам. Экспорт и удаление доступны без переписки с поддержкой."
          : "Профиль подопечного. Тренировочные данные можно смотреть и менять; удаление аккаунта доступно только владельцу."}
      </p>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">{subject.displayName}</h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {subject.email ??
                (isSelf ? "Вход через Telegram" : "Профиль без входа")}{" "}
              · язык {subject.locale}
            </p>
          </div>
          <span className="badge">{isSelf ? "V1 alpha" : "Подопечный"}</span>
        </div>

        <div className="grid grid-3">
          <div className="stat">
            <div className="stat-value">
              {profile?.experience
                ? EXPERIENCE_LABELS[profile.experience] ?? profile.experience
                : "—"}
            </div>
            <div className="stat-label">Опыт</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {profile?.goal ? GOAL_LABELS[profile.goal] ?? profile.goal : "—"}
            </div>
            <div className="stat-label">Цель</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {profile?.bodyweightKg
                ? `${profile.bodyweightKg} кг`
                : "не задан"}
            </div>
            <div className="stat-label">Вес тела</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {profile?.heightCm ? `${profile.heightCm} см` : "не задан"}
            </div>
            <div className="stat-label">Рост</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {profile?.bodyFatPercent
                ? `≈ ${profile.bodyFatPercent}%`
                : "не задан"}
            </div>
            <div className="stat-label">Процент жира</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {profile?.trainingScheme === "FIVE_DAY_CYCLE"
                ? "5-дневный"
                : "Через день"}
            </div>
            <div className="stat-label">Схема</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {cycle ? "активен" : "нет"}
            </div>
            <div className="stat-label">Цикл</div>
          </div>
        </div>

      {isSelf ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Подопечные</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Открывайте дневники людей, которых вы ведёте, и заполняйте их
                тренировки.
              </p>
            </div>
          </div>
          <Link className="btn" href="/mentees">
            Перейти к подопечным
          </Link>
        </section>
      ) : null}

      {cycle ? (
          <p className="small muted" style={{ marginTop: 14 }}>
            Цикл: {formatDate(cycle.startDate)} — {formatDate(cycle.endDate)}.
            Изменения плана — только через подтверждение.
          </p>
        ) : null}
      </section>

      {cycle ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Цикл</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Ручной пересмотр закроет текущий цикл и создаст новый на 8
                недель. Первые 4 сессии будут возвратными.
              </p>
            </div>
          </div>
          <Link className="btn" href="/cycle/review">
            Пересмотреть цикл
          </Link>
        </section>
      ) : null}

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Данные</h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              Экспорт содержит тренировки, версии плана, решения и audit.
            </p>
          </div>
        </div>
        <SettingsActions canDelete={isSelf} />
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Границы продукта</h2>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          Chiron — wellness-инструмент планирования. Он не диагностирует, не
          лечит, не оценивает безопасность боли и не заменяет врача или тренера.
          При красных флагах тренировка останавливается и рекомендуется
          неотложная помощь.
        </p>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Сырой текст для LLM хранится 90 дней. Audit — 365 дней. Логи — 30
          дней. Удаление аккаунта запускает анонимизацию и удаление данных в
          течение 30 дней; входы отключаются сразу.
        </p>
      </section>
    </div>
  );
}
