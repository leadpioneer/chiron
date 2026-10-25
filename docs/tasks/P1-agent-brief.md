# P1 — Alpha readiness: задание агенту

- **Статус:** P1-A реализован и развёрнут на staging 25.10.2026; CI зелёный
  ([run 40143095774](https://github.com/leadpioneer/chiron/actions/runs/40143095774)).
  Живой LLM eval и restore-drill прошли. P1-B: деплой `61e84e6` выполнен
  25.10.2026, `/api/health` отвечает `ok`; TMA проверена на iPhone, Android
  не проверен. Осталось провести онбординг партнёрши. Внешние алерты не нужны.
  Login Widget и связка Telegram/Web отложены на неопределённый срок по
  [`ADR-007`](../decisions/ADR-007-tma-only-and-personal-data-scope.md);
  `/setdomain` уже выполнен.
  Отчёт: [`p1-alpha-readiness`](../testing/p1-alpha-readiness-2026-10-25.md).
- **Владелец продукта:** автор проекта
- **Обязательное чтение:** `AGENTS.md`, `docs/decisions/v1-decisions.md`,
  `docs/decisions/ADR-001-implementation-slice.md`,
  `docs/decisions/ADR-002-reschedule-and-cycle-review.md`,
  `docs/decisions/ADR-003-alpha-security-and-operations.md`,
  `docs/decisions/ADR-004-non-commercial-and-data-scope.md`,
  `docs/decisions/ADR-007-tma-only-and-personal-data-scope.md`.

## Цель P1

Допустить автора и его близкого человека (партнёршу) на staging без публичной
регистрации: alpha-путь — Telegram Mini App, живой LLM с бюджетом, отдельные
БД и TLS, бэкапы. Круг и юридический режим зафиксированы в
[`ADR-007`](../decisions/ADR-007-tma-only-and-personal-data-scope.md):
3–5 тестеров — будущее расширение, не текущий этап.

P1 разделён на два среза. P1-A выполняется без внешних ключей и домена;
P1-B требует решений и доступов владельца.

## P1-A — инженерная готовность

| Задача | Содержание | Гейт |
|---|---|---|
| P1-0 Handoff | P0 закоммичен; remote и CI на чистой БД | CI зелёный после push |
| P1-1 Auth hardening | rate limit magic link и Telegram; alpha email allowlist; CSRF; ротация cookie; запрет `AUTH_DEV_MODE` в production; очистка magic links; политика удалённого аккаунта | 429 на повторный запрос; новый email вне allowlist → 403; cross-origin POST → 403; cookie обновляется; production-конфиг падает при небезопасных значениях |
| P1-2 Telegram | allowlist по username/id, Login Widget; alpha-путь — только Telegram Mini App; связка с Web-аккаунтом отложена на неопределённый срок по ADR-007 | пользователь из allowlist входит через TMA; чужой — нет |
| P1-3 Email | провайдер Resend или webhook, русский шаблон, ошибки доставки, rate limit | письмо приходит; ошибка провайдера не создаёт «вечную» ссылку |
| P1-4 LLM eval | 50 golden-кейсов, закреплённая модель, отчёт метрик, глобальный бюджет, kill switch | red recall 100%, yellow ≥95%, numeric ≥98%, invalid JSON ≤0,5%, scope 100% |
| P1-5 Staging | отдельные БД и приложение, Caddy TLS, healthcheck, миграции/seed | staging по HTTPS, `/api/health` отвечает |
| P1-6 Backups | `pg_dump`, retention, S3/rclone, проверенное восстановление | restore выполнен на staging, данные совпали |

## P1-B — личный контур

1. TMA на iPhone проверена 25.10.2026; Android не проверен. Login Widget и
   связка Telegram с Web-аккаунтом не входят в P1-B; `/setdomain` уже
   выполнен.
2. Партнёрша уже в `TELEGRAM_ALLOWLIST` (2 записи на staging); провести её
   онбординг. Уведомление об обработке данных и LLM передано словами.
3. Юридический режим по
   [`ADR-007`](../decisions/ADR-007-tma-only-and-personal-data-scope.md):
   личный контур автора и партнёрши, без уведомления Роскомнадзора по позиции
   владельца. В LLM уходит только обезличенный текст без идентификаторов,
   активный routerai, Gemini выключен. LLM включена для обоих аккаунтов.
   3–5 тестеров — будущее расширение с ToS, политикой ПД и полной проверкой.
4. Внешние алерты не нужны; журнал инцидентов ведётся по необходимости.
   Alpha-метрики для личного контура не обязательны.

## Приёмочный гейт P1-A

Одновременно:

- `npm run typecheck`, `npm test`, `npm run build`, `npm run test:cycle`,
  `npm run test:e2e` — pass на чистой `chiron_test`;
- `npm run test:llm-eval` — pass на 50 кейсах;
- magic link: 6-й запрос за 15 минут для одного email → `429`;
- повторный запрос раньше 30 секунд → `429`;
- POST с чужим `Origin` → `403`;
- production без `AUTH_SECRET`/HTTPS `APP_URL`/email-провайдера не стартует;
- удалённый аккаунт не восстанавливается тем же magic link;
- staging поднимается с TLS и проходит `/api/health`;
- backup и restore проверены на staging;
- нет P0/P1 дефектов.

## Решено 25.10.2026

- Telegram allowlist (2 записи), bot token/username/webhook, routerai и
  `LLM_API_KEY` проверены на staging; `GEMINI_API_KEY` пуст.
- LLM включена для обоих аккаунтов; внешние алерты не нужны; уведомление
  партнёрше передано словами.
- Commit/push и деплой разрешены.
- Email, Login Widget и связка Web не входят в alpha.

## Требуют подтверждения владельца

- Новые миграции.
- Изменение порогов прогрессии, safety-словарей, промптов и
  LLM-провайдера/модели.

## Не входит в P1

- Публичная регистрация, платежи, реклама, коммерческая аналитика, соцфункции,
  редизайн.
- Сплиты 3+ дней, новые шаблоны, произвольный каталог, оборудование.
- Изменение правил прогрессии и safety без отдельного решения.

## Передача

Не коммитить и не деплоить без явной просьбы. В конце сессии приложить:
изменённые файлы, результаты пяти команд, метрики LLM-eval, список
неавтоматизированных сценариев, открытые вопросы и риски.
