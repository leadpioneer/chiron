# P1-A — инженерная готовность к alpha

- **Дата:** 25.10.2026
- **Срез:** P1-A после P0; P1-B требует внешних доступов
- **База:** `chiron_test`, миграции `0000`–`0002`, seed 876 упражнений / 16
  вариантов / 1 шаблон
- **Среда:** Windows, Node 24, Next.js 16, Playwright Chromium, embedded
  PostgreSQL 18 (совместимый контур)

## Статус проекта

Chiron зафиксирован как некоммерческий проект: без платежей, рекламы,
коммерческой аналитики и продажи данных. Обработка данных ограничена
минимумом для работы дневника; текущий серверный контур хранит персональные
данные (email/Telegram id, профиль, тренировки, wellness, текст для LLM),
поэтому проект не заявляет о «нулевой обработке ПД». Решение:
[`ADR-004`](../decisions/ADR-004-non-commercial-and-data-scope.md).

## Приёмочный гейт

| Проверка | Результат |
|---|---|
| `npm run typecheck` | pass: web, core, db |
| `npm test` | 136/136, 11 файлов |
| `npm run test:llm-eval` | 50/50 кейсов, gate pass |
| `npm run build` | pass, 27 маршрутов, Proxy (Middleware) |
| `npm run test:cycle` | pass: 28 и 23 сессии |
| `npm run test:e2e` | 33/33, Chromium |
| Production-mode smoke | health 200, CSRF 403, invalid config exit 1 |
| Compose staging | `docker compose config` pass |

## LLM-eval

Локальный детерминированный прогон на 50 golden-кейсах:

| Метрика | Значение | Гейт |
|---|---|---|
| Exercise match | 100,0% | — |
| Set count match | 100,0% | — |
| Numeric accuracy | 100,0% (100/100) | ≥98% |
| Red recall | 100,0% (9/9) | 100% |
| Yellow recall | 100,0% (10/10) | ≥95% |
| Green false positives | 0/31 | — |
| Invalid JSON | 0 (0,0%) | ≤0,5% |
| Scope violations | 0 | 0 |
| Cost | $0 | — |

Живой прогон Gemini не выполнялся: нет ключа. Команда:
`LLM_EVAL_LIVE=1 GEMINI_API_KEY=… npm run test:llm-eval`.

## Полный цикл

| Схема | Сессии | Версии | Решения | Audit | DELOAD | Следующий цикл |
|---|---:|---:|---:|---:|---:|---:|
| `EVERY_OTHER_DAY` | 28 | 164 | 163 | 222 | 1 | 28 |
| `FIVE_DAY_CYCLE` | 23 | 134 | 133 | 182 | 1 | 23 |

Регрессий P0 нет.

## Playwright

| Файл | Тестов | Покрытие |
|---|---:|---|
| `auth-hardening.spec.ts` | 6 | rate limit, alpha email allowlist, CSRF, удалённый аккаунт, ротация cookie, security headers |
| `telegram.spec.ts` | 5 | Mini App allowlist, stale initData, Login Widget, forged hash |
| `auth-onboarding.spec.ts` | 4 | magic link, онбординг 28/23, профиль |
| `session.spec.ts` | 2 | запись подхода, рекомендация |
| `reschedule.spec.ts` | 1 | `SINGLE`, `ORDER_CONFLICT`, `SHIFT_TAIL`, лимит |
| `return.spec.ts` | 2 | `RETURN_1`, `RETURN_2`, повторный возврат |
| `review.spec.ts` | 4 | пересборка, остановка, ручной пересмотр, red-флаг |
| `editing.spec.ts` | 2 | правка нагрузки, частичная разгрузка |
| `calibration.spec.ts` | 2 | калибровка подсобки, завершение без подходов |
| `mobile.spec.ts` | 2 | чек-ин 390×844 и 360×800 |
| `data.spec.ts` | 2 | экспорт, мягкое удаление |
| `safety.spec.ts` | 1 | red-флаг из быстрого ввода |
| **Итого** | **33** | |

## Production-mode smoke

Сервер запущен с `NODE_ENV=production`, `AUTH_DEV_MODE=0`, HTTPS `APP_URL`,
webhook-провайдером email, `ALPHA_EMAIL_ALLOWLIST=*@chiron.test` и
`LLM_ENABLED=0`:

| Проверка | Результат |
|---|---|
| `GET /api/health` | `200`, `db: up`, `llm.enabled: false` |
| `GET /login` | `200`, `x-content-type-options: nosniff`, CSP `frame-ancestors` |
| POST с `Origin: https://evil.example` | `403 CSRF_REJECTED` |
| POST с тем же origin, email вне allowlist | `403 EMAIL_NOT_ALLOWED` |
| POST с тем же origin, email из allowlist, webhook недоступен | `502 EMAIL_FAILED`, без `devLink` |
| `AUTH_DEV_MODE=1` в production | старт завершён с кодом 1, порт закрыт |

## Что реализовано

### Auth

- DB-лимит magic link: 5 ссылок / 15 минут на email, cooldown 30 секунд.
- IP-лимит auth-маршрутов: 120 / 15 минут на процесс.
- `ALPHA_EMAIL_ALLOWLIST`: новые email вне списка получают
  `403 EMAIL_NOT_ALLOWED`; существующие пользователи входят.
- Атомарное использование magic link: `UPDATE … RETURNING` с проверкой срока.
- Удалённый аккаунт не восстанавливается ссылкой; email анонимизируется.
- Ротация JWT-cookie старше 7 дней через `proxy.ts`; абсолютный срок 30 дней.
- CSRF: `Origin`/`Referer` проверяется для небезопасных методов.
- Production-конфиг валидируется в `instrumentation.ts`; небезопасные значения
  останавливают процесс.
- Заголовки `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS в
  production, CSP `frame-ancestors` с разрешением Telegram Web.
- `npm run db:cleanup` удаляет старые использованные/истёкшие magic links.

### Email

- Провайдеры `resend`, `webhook`, `console` (dev), `none`.
- Русский текст и HTML-шаблон, кнопка и fallback-ссылка.
- Таймаут 8 секунд; ошибка доставки удаляет созданную ссылку.
- В production `console`/`none` запрещены.

### Telegram

- Allowlist по username/id (`TELEGRAM_ALLOWLIST`) для новых пользователей.
- Login Widget: проверка SHA-256(bot token), `auth_date` ≤24 часов.
- Mini App `initData` и виджет используют один сценарий создания identity.
- Виджет рендерится только при заданном `TELEGRAM_BOT_USERNAME`.
- Связка Telegram с Web-аккаунтом по коду отложена в P1-B.

### LLM

- 50 golden-кейсов вместо 20.
- `npm run test:llm-eval` считает exercise/sets/numeric/safety/invalid JSON/scope.
- Глобальный месячный бюджет `LLM_GLOBAL_MONTHLY_BUDGET_USD`.
- Алерт при 80% любого бюджета, fallback при 100%.
- `LLM_ENABLED=0` — kill switch.
- Промпт и версии вынесены в `packages/core/src/llm-contract.ts`, чтобы
  eval и runtime использовали один контракт.

### Staging и бэкапы

- `docker-compose.staging.yml`: отдельная БД, bootstrap, web healthcheck,
  Caddy TLS, backup-профиль.
- `deploy/Caddyfile`: HTTPS, HSTS, JSON-логи.
- `scripts/backup-db.sh`: `pg_dump`, retention, опциональный rclone.
- `scripts/restore-db.sh`: защита `RESTORE_CONFIRM=YES`, запрет production без
  `ALLOW_PROD_RESTORE=1`.
- `docs/runbooks/staging.md`: запуск, секреты, мониторинг, учебная тревога.

## Найденные и исправленные дефекты

1. **Soft-deleted resurrection.** `verify` сбрасывал `deletedAt` при конфликте
   email. Теперь удалённый аккаунт отклоняется, а ссылка атомарно помечается
   использованной.
2. **Replay magic link.** Проверка и пометка `used_at` были неатомарными.
   Теперь один `UPDATE … RETURNING`.
3. **Неотправленная ссылка оставалась валидной.** При ошибке email созданная
   запись удаляется.
4. **Production мог молча не отправлять письма.** `console`/`none` теперь
   запрещены при старте и возвращают `503` в запросе.
5. **Telegram widget зависел от build-time env.** `NEXT_PUBLIC_*` заменён на
   runtime-проп из server component.
6. **Небезопасный production-конфиг не останавливал процесс.** Добавлена
   валидация в instrumentation; процесс завершается с кодом 1.

## Не выполнено в P1-A

- Docker daemon не запущен: staging-контейнеры, Caddy TLS и restore-drill не
  прогнаны на живой БД. Compose-конфиг валиден.
- Нет remote Git/GitHub: CI workflow добавлен, но GitHub Actions не запускался.
- Нет live LLM-ключа: живой eval и калибровка модели не выполнены.
- Нет Telegram bot token/username и реальных устройств.
- Связка Telegram с Web-аккаунтом, юридические документы, РКН/DPIA,
  alpha-метрики, алерты и поддержка — P1-B.
- IP rate limit хранится в памяти процесса; для нескольких инстансов нужен
  общий store.
- PWA и Telegram не проверены на iOS Safari и Android Chrome.

## Риски

- Cooldown 30 секунд может раздражать при повторной отправке письма; порог
  задаётся в `auth-rate-limit.ts` и должен проверяться на alpha.
- CSRF допускает запросы без `Origin`/`Referer` для серверных клиентов; защита
  опирается также на `SameSite=Lax`.
- При отключённом LLM качество парсинга ниже; это осознанный fallback.
- Восстановление бэкапа на staging остаётся обязательным до допуска тестеров.

## Следующий шаг

P1-B: remote и CI, домен/VPS/TLS, живой LLM, Telegram-бот и устройства,
юридические документы, allowlist-инвайты, мониторинг и учебное восстановление
бэкапа.
