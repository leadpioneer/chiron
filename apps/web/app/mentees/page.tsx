import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { formatDate } from "@/src/lib/dates";
import {
  listMentees,
  listUnlinkedTelegramIds,
} from "@/src/lib/mentee-service";

export const metadata = { title: "Подопечные" };

const ERROR_TEXT: Record<string, string> = {
  access: "Нет доступа к этому дневнику.",
  name_required: "Укажите имя подопечного.",
  telegram_id_invalid: "Telegram ID должен состоять из цифр.",
  telegram_already_linked: "Этот Telegram уже привязан к другому профилю.",
  cannot_link_self: "Нельзя связать тренера с самим собой.",
  already_has_coach: "У пользователя уже есть активный тренер.",
  not_found: "Связь с подопечным не найдена.",
};

export default async function MenteesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  const { error } = await searchParams;
  const mentees = await listMentees(viewer.id);
  const telegramIds = await listUnlinkedTelegramIds();

  return (
    <div>
      <p className="eyebrow">Тренерский режим</p>
      <h1 className="page-title">Подопечные</h1>
      <p className="subtitle">
        Откройте дневник подопечного, чтобы смотреть и заполнять его
        тренировки. Все изменения фиксируются в аудите.
      </p>

      {error ? (
        <p className="notice" style={{ marginBottom: 14 }}>
          {ERROR_TEXT[error] ?? "Не удалось выполнить действие."}
        </p>
      ) : null}

      {mentees.length === 0 ? (
        <section className="card">
          <h2 className="card-title">Пока никого нет</h2>
          <p className="small muted">
            Создайте профиль подопечного. Он будет без отдельного входа: вы
            заполняете его дневник, а позже сможете привязать Telegram.
          </p>
        </section>
      ) : (
        <div className="stack">
          {mentees.map((mentee) => (
            <section className="card" key={mentee.id}>
              <div className="row-between wrap">
                <div>
                  <h2 className="card-title">{mentee.displayName}</h2>
                  <p className="small muted" style={{ margin: "4px 0 0" }}>
                    {mentee.hasLogin ? "Есть вход" : "Профиль без входа"}
                    {mentee.cycleStart && mentee.cycleEnd
                      ? ` · цикл ${formatDate(mentee.cycleStart)} — ${formatDate(mentee.cycleEnd)}`
                      : " · цикл не начат"}
                  </p>
                  {mentee.lastCompletedDate ? (
                    <p className="tiny muted" style={{ margin: "4px 0 0" }}>
                      Последняя тренировка: {formatDate(mentee.lastCompletedDate)}
                    </p>
                  ) : null}
                </div>
                <form action="/api/subject" method="post">
                  <input
                    type="hidden"
                    name="menteeUserId"
                    value={mentee.id}
                  />
                  <button className="btn btn-primary" type="submit">
                    Открыть дневник
                  </button>
                </form>
              </div>

              <div className="row-between wrap" style={{ marginTop: 14 }}>
                <span className="tiny muted">
                  Доступ: {mentee.permissions === "READ" ? "чтение" : "чтение и запись"}
                </span>
                <form action={`/api/mentees/${mentee.id}/revoke`} method="post">
                  <button className="btn btn-ghost btn-sm" type="submit">
                    Убрать доступ
                  </button>
                </form>
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Добавить подопечного</h2>
        <p className="small muted">
          Создаётся отдельный профиль без логина. Вы сразу перейдёте к его
          онбордингу.
        </p>
        <form action="/api/mentees" method="post" className="stack">
          <label className="field">
            <span className="label">Имя</span>
            <input
              className="input"
              name="displayName"
              required
              maxLength={60}
              placeholder="Например, Даша"
            />
          </label>
          {telegramIds.length > 0 ? (
            <label className="field">
              <span className="label">
                Telegram подопечного (необязательно)
              </span>
              <select className="input" name="telegramId" defaultValue="">
                <option value="">Привязать позже</option>
                {telegramIds.map((id) => (
                  <option value={id} key={id}>
                    ID {id}
                  </option>
                ))}
              </select>
              <span className="tiny muted">
                Если выбрать ID, подопечный войдёт в этот же профиль, а не
                создаст второй. Не выбирайте свой собственный ID.
              </span>
            </label>
          ) : (
            <p className="tiny muted">
              Свободных Telegram ID в allowlist нет. Привязку можно будет
              добавить позже.
            </p>
          )}
          <button className="btn btn-primary" type="submit">
            Создать и заполнить профиль
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">Уже есть аккаунт</h2>
        <p className="small muted">
          Если человек уже зарегистрирован в Chiron, свяжите его по числовому
          Telegram ID. Второй профиль не создаётся.
        </p>
        <form action="/api/mentees/link" method="post" className="stack">
          <label className="field">
            <span className="label">Telegram ID</span>
            <input
              className="input"
              name="telegramId"
              required
              inputMode="numeric"
              pattern="[0-9]+"
              placeholder="Например, 123456789"
            />
          </label>
          <button className="btn" type="submit">
            Связать и открыть дневник
          </button>
        </form>
      </section>

      <p className="tiny muted" style={{ marginTop: 16 }}>
        Вернуться в свой дневник можно в любой момент через плашку сверху.{" "}
        <Link href="/today">Сегодня</Link>
      </p>
    </div>
  );
}
