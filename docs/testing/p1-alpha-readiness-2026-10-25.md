# P1-A — инженерная готовность к alpha

- **Дата:** 25.10.2026
- **Срез:** P1-A после P0; P1-B требует внешних доступов
- **База:** `chiron_test`, миграции `0000`–`0002`, seed 876 упражнений / 16
  вариантов / 1 шаблон
- **Среда:** Windows, Node 24, Next.js 16, Playwright Chromium, embedded
  PostgreSQL 18 (совместимый контур)

> **Обновление 25.10.2026:** `/setdomain` выполнен владельцем; Login Widget и
> связка Telegram/Web не входят в alpha-путь и отложены по
> [`ADR-007`](../decisions/ADR-007-tma-only-and-personal-data-scope.md).
> Ниже сохранён срез P1-A на момент отчёта.

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
| `npm test` | 143/143, 12 файлов |
| `npm run test:llm-eval` | 50/50 кейсов, gate pass |
| Live LLM eval (routerai) | gate pass: red 100%, yellow 100%, numeric 99%, invalid JSON 0% |
| `npm run build` | pass, 27 маршрутов, Proxy (Middleware) |
| `npm run test:cycle` | pass: 28 и 23 сессии |
| `npm run test:e2e` | 35/35, Chromium |
| Production-mode smoke | health 200, CSRF 403, invalid config exit 1 |
| Native staging | HTTPS, health 200, TLS Let's Encrypt, noindex |
| Backup/restore drill | pass: `pg_dump` + `pg_restore` в отдельную БД |
| Compose staging | `docker compose config` pass |
| GitHub Actions CI | success, [run 40145979850](https://github.com/leadpioneer/chiron/actions/runs/40145979850) |

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

Живой прогон на staging с routerai
(`~deepseek/deepseek-v4-flash-latest`, `reasoning_effort=none`):

| Метрика | Значение | Гейт |
|---|---|---|
| Exercise match | 100,0% | — |
| Set count match | 96,0% | — |
| Numeric accuracy | 99,0% (97/98) | ≥98% |
| Red recall (pipeline) | 100,0% (9/9) | 100% |
| Yellow recall (pipeline) | 100,0% (10/10) | ≥95% |
| Green false positives | 0/31 | — |
| LLM-only safety mismatches | 6 (диагностика) | — |
| Invalid JSON | 0 (0,0%) после одного retry | ≤0,5% |
| Scope violations | 0 | 0 |
| Cost | $0,882 на 50 кейсов | — |

Safety-гейт считается по объединению детерминированной оценки и LLM
(`mergeSafetyAssessments`), как в `/api/sessions/:id/parse`. LLM-only метки
не являются авторитетными: в живом прогоне они разошлись с ожиданием в 6
кейсах, но детерминированные red-правила сохранили 100% recall. Один retry
провайдера убирает schema-rejected ответы; при повторной ошибке используется
локальный парсер.

## Live staging

Приватный alpha-контур развёрнут на сервере владельца. Адрес, IP, Telegram
id и ключи не публикуются в репозитории.

- **Runtime:** Node 24, Next.js 16, systemd `chiron`, PostgreSQL 17 на
  локальном сокете, приложение слушает `127.0.0.1:3000`.
- **TLS/маршрутизация:** Nginx vhost за HAProxy SNI, сертификат Let's Encrypt
  с автоматическим продлением.
- **Health:** `GET /api/health` → `200`, `db: up`, LLM provider `openai`.
- **Индексация:** `/robots.txt` → `Disallow: /`; все ответы с
  `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`;
  страницы с meta robots.
- **Telegram:** Mini App login для allowlisted владельца → `200`; посторонний
  id → `403 TELEGRAM_NOT_ALLOWED`; тестовое сообщение доставлено только
  владельцу. Второй allowlisted тестер не получал сообщений.
- **LLM:** живой eval прошёл; один вызов парсинга через приложение записан в
  `llm_calls` как `routerai`, `valid`, стоимость ≈$0,017.
- **Backup:** ежедневный cron `pg_dump` + retention 14 дней; restore-drill в
  отдельную БД прошёл, счётчики `users`, `exercises`, `training_cycles`,
  `plan_versions`, `sessions`, `set_performances`, `audit_events` совпали.
- **Email:** `EMAIL_PROVIDER=none`; форма email скрыта, magic link отвечает
  `503`. Вход только через Telegram до подключения провайдера.

## Post-P1 additions (25.10.2026)

- **Ягодичный мостик:** curated `glute_bridge` / `barbell_glute_bridge`
  добавлен в `posterior_chain` как подсобное к румынской тяге (2 × 8–12,
  RIR 2). Новые циклы получают его из шаблона. Активный план владельца прошёл
  две one-off миграции: версия 2 добавила мостик, версия 3 пометила его
  `optional=true`; в сессии видны «Румынская тяга», «Ягодичный мостик» и
  плашка «необязательно».
- **Замена упражнений:** кнопка «Заменить» у каждого упражнения в
  `PLANNED`-сессии. E2E заменяет основную румынскую тягу на вариант с
  гантелями и эстетический бицепс на махи; создаются plan version 2 и 3,
  две decision `EXERCISE_SWAP`, два audit `PLAN_VERSION_CREATED`, нагрузка
  обнуляется. Миграция мостика идемпотентна (второй запуск: updated 0).
- **Telegram-напоминания:** cron `0 16 * * *` (MSK) установлен; dry-run
  видит 1 сессию на сегодня. Текст минималистичный, без списка упражнений:
  «Сегодня тренировка «Тяни/Толкай»». Тестовое сообщение отправлено только
  владельцу (message_id 96) с реальной сессией и двумя кнопками: «Отложить на
  завтра» и «Окей».
  Входящий Telegram webhook на staging получал `Connection timed out`, поэтому
  callback-и забирает long-polling сервис `chiron-telegram-poll` через
  исходящий прокси. Реальное нажатие «Окей» обработано: offset
  `251921674`, сообщение 96 удалено, сессия осталась на 2026-10-25.
  Локальный webhook проверен отдельно: без secret → `403`, с secret → `200`;
  симулированный postpone перенёс тестовую сессию на 2026-10-26 и записал
  `SESSION_RESCHEDULED`; тестовые данные удалены.
- **Кодировка:** исходящие сообщения бота теперь идут через UTF-8 JSON и
  HTTP-прокси; старые `?????` были следствием PowerShell-отправки, не
  серверного кода.

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
- `robots.txt`, `X-Robots-Tag` и meta robots закрывают alpha-домен от
  индексации.
- `npm run db:cleanup` удаляет старые использованные/истёкшие magic links.

### Email

- Провайдеры `resend`, `webhook`, `console` (dev), `none`.
- Русский текст и HTML-шаблон, кнопка и fallback-ссылка.
- Таймаут 8 секунд; ошибка доставки удаляет созданную ссылку.
- В production `console` запрещён; явный `none` разрешён для Telegram-only
  alpha, скрывает email-форму и возвращает `503` из `request-link`.

### Telegram

- Allowlist по username/id (`TELEGRAM_ALLOWLIST`) для новых пользователей.
- Login Widget: проверка SHA-256(bot token), `auth_date` ≤24 часов.
- Mini App `initData` и виджет используют один сценарий создания identity.
- Виджет рендерится только при заданном `TELEGRAM_BOT_USERNAME`.
- Связка Telegram с Web-аккаунтом по коду отложена в P1-B.

### LLM

- 50 golden-кейсов вместо 20.
- `npm run test:llm-eval` считает exercise/sets/numeric/safety/invalid JSON/scope.
- Активный провайдер routerai (OpenAI-compatible), модель
  `~deepseek/deepseek-v4-flash-latest`, `reasoning_effort=none`.
- Один retry при JSON/schema-ошибке; затем локальный парсер.
- Стоимость берётся из `usage.cost` провайдера, иначе — из ставок env.
- Safety-гейт — объединение детерминированной оценки и LLM-наблюдений;
  LLM-метки не могут понизить red.
- Глобальный месячный бюджет `LLM_GLOBAL_MONTHLY_BUDGET_USD`.
- Алерт при 80% любого бюджета, fallback при 100%.
- `LLM_ENABLED=0` — kill switch.
- Промпт и версии вынесены в `packages/core/src/llm-contract.ts`, чтобы
  eval и runtime использовали один контракт.

### Staging и бэкапы

- Текущий alpha: native Node/Next + PostgreSQL 17 + Nginx/HAProxy, systemd,
  Let's Encrypt, `/opt/chiron` (код, env, бэкапы).
- `docker-compose.staging.yml`: отдельная БД, bootstrap, web healthcheck,
  Caddy TLS, backup-профиль — альтернативный контур для будущего деплоя.
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
4. **Production мог молча не отправлять письма.** `console` запрещён при
   старте; явный `none` скрывает email-форму и возвращает `503`.
5. **Telegram widget зависел от build-time env.** `NEXT_PUBLIC_*` заменён на
   runtime-проп из server component.
6. **Небезопасный production-конфиг не останавливал процесс.** Добавлена
   валидация в instrumentation; процесс завершается с кодом 1.
7. **Schema drift провайдера.** DeepSeek иногда дублирует ключи или теряет
   `missingFields`. Добавлен один retry; при повторной ошибке — локальный
   парсер. Живой прогон: 0 invalid JSON.
8. **LLM safety-метки ненадёжны.** 6/50 расхождений в живом прогоне;
   `/api/sessions/:id/parse` объединяет их с детерминированными red-правилами,
   поэтому pipeline red recall 100%.

## Не выполнено в P1-A

- Login Widget в браузере требует `/setdomain` в BotFather; Mini App через
  кнопку меню уже работает.
- Живой callback из Telegram-клиента не нажимался; симулированный webhook
  прошёл. `last_error` в Bot API остался от запроса до деплоя и очистится
  после первого успешного реального callback.
- Нет проверки на реальных iOS Safari и Android Chrome.
- Связка Telegram с Web-аккаунтом по коду, юридические документы, РКН/DPIA,
  alpha-метрики, внешние алерты и поддержка — P1-B.
- IP rate limit хранится в памяти процесса; для нескольких инстансов нужен
  общий store.
- Docker-контур staging не запускался (Docker daemon отсутствует); текущий
  staging использует native Node/Postgres/Nginx и проверен.

## Риски

- Cooldown 30 секунд может раздражать при повторной отправке письма; порог
  задаётся в `auth-rate-limit.ts` и должен проверяться на alpha.
- CSRF допускает запросы без `Origin`/`Referer` для серверных клиентов; защита
  опирается также на `SameSite=Lax`.
- LLM-only safety-метки расходятся с ожиданием в 6/50 кейсов; pipeline
  защищён детерминированными правилами, но LLM нельзя делать единственным
  источником safety-решения.
- Стоимость живого eval ≈$0,88; один парсинг ≈$0,017. Бюджеты: $0,5/день,
  $10/месяц на пользователя, $20/месяц глобально.
- Email-вход на текущем staging отключён; до подключения провайдера тестеры
  входят только через Telegram.
- IP-ограничение LLM-ключа привязано к staging-серверу; локальные вызовы
  могут получать `403`.

## Следующий шаг

P1-B: `/setdomain` для Login Widget, реальные iOS/Android, связка Telegram с
Web-аккаунтом, юридические документы, alpha-метрики, внешний мониторинг и
алерты, поддержка и инциденты.
