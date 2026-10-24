# P1 — Alpha readiness: задание агенту

- **Статус:** P1-A реализован 25.10.2026, CI на GitHub зелёный
  ([run 40138587684](https://github.com/leadpioneer/chiron/actions/runs/40138587684));
  живой staging и P1-B ждут внешних доступов. Отчёт:
  [`p1-alpha-readiness`](../testing/p1-alpha-readiness-2026-10-25.md).
- **Владелец продукта:** автор проекта
- **Обязательное чтение:** `AGENTS.md`, `docs/decisions/v1-decisions.md`,
  `docs/decisions/ADR-001-implementation-slice.md`,
  `docs/decisions/ADR-002-reschedule-and-cycle-review.md`,
  `docs/decisions/ADR-003-alpha-security-and-operations.md`.

## Цель P1

Допустить 3–5 приглашённых тестеров на staging без публичной регистрации:
вход через Telegram и email, живой LLM с бюджетом, отдельные БД и TLS,
бэкапы, юридические документы и alpha-метрики.

P1 разделён на два среза. P1-A выполняется без внешних ключей и домена;
P1-B требует решений и доступов владельца.

## P1-A — инженерная готовность

| Задача | Содержание | Гейт |
|---|---|---|
| P1-0 Handoff | P0 закоммичен; remote и CI на чистой БД | CI зелёный после push |
| P1-1 Auth hardening | rate limit magic link и Telegram; alpha email allowlist; CSRF; ротация cookie; запрет `AUTH_DEV_MODE` в production; очистка magic links; политика удалённого аккаунта | 429 на повторный запрос; новый email вне allowlist → 403; cross-origin POST → 403; cookie обновляется; production-конфиг падает при небезопасных значениях |
| P1-2 Telegram | allowlist по username/id, Login Widget, связка с Web-аккаунтом | тестер из allowlist входит; чужой — нет |
| P1-3 Email | провайдер Resend или webhook, русский шаблон, ошибки доставки, rate limit | письмо приходит; ошибка провайдера не создаёт «вечную» ссылку |
| P1-4 LLM eval | 50 golden-кейсов, закреплённая модель, отчёт метрик, глобальный бюджет, kill switch | red recall 100%, yellow ≥95%, numeric ≥98%, invalid JSON ≤0,5%, scope 100% |
| P1-5 Staging | отдельные БД и приложение, Caddy TLS, healthcheck, миграции/seed | staging по HTTPS, `/api/health` отвечает |
| P1-6 Backups | `pg_dump`, retention, S3/rclone, проверенное восстановление | restore выполнен на staging, данные совпали |

## P1-B — допуск тестеров

1. Реальный Telegram-бот, домен, проверка на iOS Safari и Android Chrome.
2. Живой LLM с ключом, закреплённой моделью, согласием и бюджетом.
3. Юридическое: подтвердить некоммерческий статус и границы данных по
   [`ADR-004`](../decisions/ADR-004-non-commercial-and-data-scope.md). Для
   текущего серверного контура — ToS, политика ПД, согласие на LLM, проверка
   152-ФЗ, сроки хранения. Для буквального zero-PD — сначала локальный контур
   без аккаунтов, LLM и серверных бэкапов.
4. Allowlist и инвайты, alpha-метрики, мониторинг, алерты, поддержка, журнал
   инцидентов.
5. PWA/Telegram E2E на реальных устройствах.

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

## Требуют подтверждения владельца

- Новые миграции (P1-A их не добавляет).
- Email-провайдер и from-домен.
- Telegram bot token, username, allowlist, политика инвайтов.
- LLM-провайдер, модель, бюджет, текст согласия.
- Домен, VPS в РФ, S3-совместимый bucket.
- Юридические документы, границы данных и сроки хранения (ADR-004).
- Изменение порогов прогрессии, safety-словарей и промптов.

## Не входит в P1

- Публичная регистрация, платежи, реклама, коммерческая аналитика, соцфункции,
  редизайн.
- Сплиты 3+ дней, новые шаблоны, произвольный каталог, оборудование.
- Изменение правил прогрессии и safety без отдельного решения.

## Передача

Не коммитить и не деплоить без явной просьбы. В конце сессии приложить:
изменённые файлы, результаты пяти команд, метрики LLM-eval, список
неавтоматизированных сценариев, открытые вопросы и риски.
