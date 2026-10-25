# Chiron

[![CI](https://github.com/leadpioneer/chiron/actions/workflows/ci.yml/badge.svg)](https://github.com/leadpioneer/chiron/actions/workflows/ci.yml)

Адаптивный дневник силовых тренировок для начинающих и возвращающихся любителей.
Wellness-инструмент: не диагностирует, не лечит и не заменяет врача или тренера.

Продуктовые и методические решения V1 зафиксированы в
[`docs/decisions/v1-decisions.md`](docs/decisions/v1-decisions.md). Этот файл —
краткая инструкция по запуску и карта реализации.

## Статус проекта

Chiron — некоммерческий личный проект: без платежей, подписок, рекламы,
партнёрских программ, коммерческой аналитики и продажи данных. Alpha
проводится только по приглашению.

Цель проекта — тренировочный дневник, а не сбор персональных данных. Данные
ограничены минимумом, без которого работают вход и дневник: идентификатор
входа (email или Telegram id), профиль, тренировки, wellness и текст для
LLM. Эти сведения относятся к персональным, поэтому проект не заявляет о
«нулевой обработке ПД»: он минимизирует обработку, не использует её
коммерчески и хранит только необходимое. Экспорт JSON и удаление аккаунта
доступны.

Если нужен буквальный zero-PD, требуется локальный контур без аккаунтов,
сервера, LLM и серверных бэкапов. Это отдельное решение, а не настройка
текущего V1: [`ADR-004`](docs/decisions/ADR-004-non-commercial-and-data-scope.md).

## Что уже работает

- Вход по email magic link, Telegram Mini App `initData`, Telegram Login Widget
  и демо-вход для разработки.
- Rate limit magic link и Telegram, CSRF-проверка Origin, ротация сессионной
  cookie раз в 7 дней, allowlist Telegram, запрет `AUTH_DEV_MODE` в production.
- Email-провайдер Resend или webhook; русский шаблон письма; ошибка доставки
  удаляет неотправленную ссылку.
- Telegram-виджет входа появляется только при заданном
  `TELEGRAM_BOT_USERNAME`; allowlist ограничивает новых пользователей.
- Минималистичное напоминание в Telegram в 16:00 МСК (без списка упражнений),
  если на сегодня есть запланированная тренировка; inline-кнопки «Отложить на
  завтра» (перенос) и «Окей» (удаляет сообщение). На staging callback-и
  забирает long-polling сервис `chiron-telegram-poll`, так как входящий
  Telegram webhook там недоступен.
- Один шаблон «Тяни / Толкай»: два самостоятельных основных движения в
  тренировке, необязательная подсобка, эстетика.
- Онбординг: вес, рост, приблизительный процент жира, схема тренировок,
  варианты, подсобка и стартовые нагрузки.
- Цикл на 8 недель: схема «через день» (~28 тренировок) или
  «треня–отдых–треня–отдых–отдых» (~23 тренировки).
- Дневник подходов: вес, повторы, RIR, техника, боль, таймер отдыха.
- Перенос запланированной тренировки: только одна сессия (`SINGLE`) или
  текущая и весь хвост (`SHIFT_TAIL`); конфликт порядка — `409 ORDER_CONFLICT`,
  продление цикла не больше 14 дней.
- Возврат после паузы 8–27 дней: `RETURN_1` (−5%, RIR 3) или `RETURN_2`
  (−10%, RIR 4 → 3) с подтверждением и отдельной версией плана.
- Пересмотр цикла после паузы ≥28 дней или safety-паузы: пересборка на 8 недель
  с теми же упражнениями и 4 сессиями возвращения либо остановка цикла.
- Библиотека 876 упражнений из `RU-free-exercise-db`: русские названия,
  инструкции и оборудование; техника показывается в карточке упражнения.
- Недельный чек-ин: качество сна, стресс, мотивация, болезненность.
- КПШ и тоннаж по упражнению; тоннаж не суммируется между упражнениями.
- Детерминированные рекомендации `PROGRESS / HOLD / LOCAL_REDUCE / DELOAD /
  PAUSE` с областью действия и объяснением.
- Подтверждение, редактирование и отклонение рекомендации.
- Copy-on-write версии плана, решения и audit.
- Замена основного или подсобного упражнения из каталога: новая версия плана,
  decision и audit, нагрузка обнуляется для калибровки. К румынке добавлен
  ягодичный мостик.
- Safety-гейты, red-флаги и пауза тренировочных рекомендаций.
- Локальный парсер текста и опциональный LLM-парсер (routerai/OpenAI-compatible,
  Gemini как альтернатива) с fallback, kill switch `LLM_ENABLED=0`, per-user и
  глобальным бюджетом.
- Golden dataset из 50 кейсов и `npm run test:llm-eval` с метриками red/yellow,
  numeric accuracy, invalid JSON и scope.
- История по упражнениям, экспорт JSON, удаление аккаунта.
- PWA manifest и service worker; Telegram Mini App bootstrap.
- Staging: native Node/Postgres/Nginx/HAProxy контур с Let's Encrypt,
  noindex, systemd, ежедневным `pg_dump` и проверенным restore-drill;
  `docker-compose.staging.yml` остаётся альтернативой.

## Стек

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4.
- PostgreSQL 16, Drizzle ORM, `postgres.js`.
- npm workspaces: `apps/web`, `packages/core`, `packages/contracts`,
  `packages/db`.
- `packages/core` — чистый TypeScript без Next.js, React и БД.
- Zod-контракты в `packages/contracts`.
- Vitest для доменных тестов.

## Быстрый старт

```bash
npm install
copy .env.example .env
```

### Вариант A — Docker

```bash
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

### Вариант B — без Docker (встроенный PostgreSQL для разработки)

Установите в `.env`:

```text
DATABASE_URL=postgres://chiron:chiron@localhost:55432/chiron
```

Затем в одном терминале:

```bash
npm run db:dev
```

Команда поднимает локальный PostgreSQL в `~/.chiron/pgdata`, применяет миграции
и заполняет каталог. Во втором терминале:

```bash
npm run dev
```

`db:dev` держит базу запущенной; остановить — `Ctrl+C`. Данные сохраняются в
`~/.chiron/pgdata` вне проекта, поэтому watcher Next.js не реагирует на WAL и
не перезагружает страницу.

Можно также использовать любой внешний PostgreSQL 16 и задать `DATABASE_URL`
в `.env`.

Откройте `http://localhost:3000`. В режиме разработки доступен «Демо-вход».
Для реального входа укажите email — ссылка появится в ответе API/консоли
(`AUTH_DEV_MODE=1`) или будет отправлена через `EMAIL_WEBHOOK_URL`.

### Переменные окружения

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | ≥32 символа, подпись сессионной cookie |
| `AUTH_DEV_MODE` | `1` — демо-вход и ссылка входа в ответе; в production запрещён |
| `APP_URL` | публичный URL для magic link; в production только `https` |
| `ALLOWED_ORIGINS` | дополнительные origin для CSRF-проверки, через запятую |
| `ALPHA_EMAIL_ALLOWLIST` | точные email или `*@domain`; пустой список блокирует новые email-регистрации |
| `TELEGRAM_BOT_TOKEN` | проверка `initData` Mini App и Login Widget |
| `TELEGRAM_BOT_USERNAME` | username бота для Login Widget, без `@` |
| `TELEGRAM_ALLOWLIST` | username/id, которым разрешена регистрация через Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | секрет webhook для inline-кнопок |
| `TELEGRAM_PROXY_URL` | HTTP-прокси для исходящих вызовов Telegram API |
| `TELEGRAM_API_TIMEOUT_MS` | таймаут Telegram API, по умолчанию 15000 |
| `EMAIL_PROVIDER` | `resend`, `webhook`, `console` (dev) или `none`; `none` скрывает email-вход |
| `RESEND_API_KEY` / `EMAIL_FROM` | ключ и отправитель Resend |
| `EMAIL_REPLY_TO` / `EMAIL_APP_NAME` | необязательные reply-to и имя в письме |
| `EMAIL_WEBHOOK_URL` | webhook `{to, url}` для отправки magic link |
| `LLM_ENABLED` | `0` — kill switch, всегда локальный парсер |
| `LLM_PROVIDER` | `openai` (OpenAI-compatible), `gemini` или `none` |
| `LLM_BASE_URL` | base URL провайдера, для alpha `https://routerai.ru/api/v1` |
| `LLM_API_KEY` | ключ OpenAI-compatible провайдера; только серверный env |
| `LLM_MODEL` | `~deepseek/deepseek-v4-flash-latest` для alpha |
| `LLM_JSON_MODE` | `0` отключает `response_format=json_object` |
| `LLM_REASONING_EFFORT` | `none` отключает reasoning у провайдера |
| `GEMINI_API_KEY` | альтернативный Gemini-провайдер |
| `LLM_DAILY_BUDGET_USD` / `LLM_MONTHLY_BUDGET_USD` | лимиты пользователя |
| `LLM_GLOBAL_MONTHLY_BUDGET_USD` | общий месячный лимит всех пользователей |
| `LLM_BUDGET_ALERT_RATIO` | порог предупреждения о бюджете, по умолчанию `0.8` |
| `LLM_INPUT_USD_PER_1M` / `LLM_OUTPUT_USD_PER_1M` | ставки для оценки стоимости вызова |

## Команды

```bash
npm test               # 143 доменных теста, включая 50 golden-кейсов парсера
npm run typecheck      # TypeScript во всех workspace
npm run build          # production build Next.js
npm run test:cycle     # полный симулятор 28 и 23 сессий на чистой test-БД
npm run test:e2e       # Playwright: 35 сценариев
npm run test:llm-eval  # метрики LLM на 50 golden-кейсах (локальный парсер)
npm run db:test:prepare # создать/мигрировать/засеять chiron_test
npm run db:cleanup     # удалить старые использованные magic links
npm run db:dev         # локальный PostgreSQL + миграции + seed (без Docker)
npm run db:generate    # сгенерировать SQL-миграцию
npm run db:migrate     # применить миграции
npm run db:seed        # каталог упражнений и шаблон
npm run db:push        # синхронизировать схему без миграции (dev)
```

Живой LLM-eval включается явно и требует ключ:

```bash
LLM_EVAL_LIVE=1 LLM_PROVIDER=openai LLM_BASE_URL=https://routerai.ru/api/v1 \
  LLM_API_KEY=... LLM_MODEL=~deepseek/deepseek-v4-flash-latest npm run test:llm-eval
```

`test:cycle` и `test:e2e` работают только с `chiron_test`: скрипты проверяют
имя БД и отказываются запускаться на dev-базе. Для Playwright один раз
установите браузер:

```bash
npx playwright install chromium
```

## Архитектура

```text
apps/web
  app/                 страницы и REST route handlers
  src/components/      клиентские формы и дневник
  src/lib/             auth, plan/recommendation/history services, LLM gateway
packages/core          метрики, прогрессия, safety, шаблон, расписание, парсер
packages/contracts     Zod-схемы API и типы
packages/db            Drizzle schema, client, migrations, seed
```

`getDb()` — ленивый singleton. Next.js не подключается к БД на этапе сборки.
Корневой `.env` загружается в `next.config.ts`; скрипты БД загружают его через
`packages/db/src/load-env.ts`.

## Каталог упражнений

`data/exercises.ru.json` — русская база из форка
[`leadpioneer/RU-free-exercise-db`](https://github.com/leadpioneer/RU-free-exercise-db)
(Unlicense, 876 упражнений). `npm run db:seed` импортирует её в
`exercise_library`; варианты шаблона связаны с записями через `library_id`, а
инструкции показываются в карточке упражнения. Текст техники — справочный, не
заменяет очную оценку тренера.

## Правила V1

- Цикл: 8 календарных недель. Двухдневный сплит задаётся схемой: «через день»
  (~28 сессий) или «треня–отдых–треня–отдых–отдых» (~23 сессии). Дни недели
  понадобятся для сплита на 3 и более тренировок.
- Минимум 8 экспозиций на основное движение — ориентир полноценного цикла.
- Основное: 3 подхода × 5–8, целевой RIR 2.
- Подсобка: 2–3 × 8–12, RIR 2–3; эстетика: 2–3 × 10–15, RIR 1–2.
- Сначала растут повторы, затем вес на один шаг оборудования.
- Повышение веса при RIR ≥3 — сразу; при RIR 2 — после двух экспозиций.
- Недобор, RIR ниже цели, боль или предельная техника → `HOLD`.
- Две сопоставимые экспозиции со снижением → `LOCAL_REDUCE`.
- Снижение в двух основных движениях + системная усталость → `DELOAD`.
- Одно решение меняет один параметр одного упражнения.
- Red-флаг останавливает тренировку; yellow блокирует повышение в своей области.
- Подсобка необязательна: пустой слот — валидное состояние.

### Паузы, возврат и пересмотр

- 0–7 дней без тренировок — обычное продолжение без изменения нагрузки.
- 8–13 дней — `RETURN_1`: −5% к нагрузке, RIR 3, прогрессия заблокирована на
  одну сессию.
- 14–27 дней — `RETURN_2`: −10%, RIR 4, затем RIR 3; прогрессия заблокирована
  на две сессии.
- ≥28 дней — старт блокируется, требуется пересборка или остановка цикла.
- Активная safety-пауза (красный флаг, принятая `PAUSE`, болезнь) блокирует
  старт. При длительности ≥14 дней пересмотр обязателен; до 14 дней доступен
  ручной пересмотр. Пересборка не заменяет медицинскую оценку.
- Вернуться можно только после явного подтверждения; автоматического повышения
  нагрузки после паузы нет.
- Перенос не меняет назначения и не создаёт версию плана. Сдвиг хвоста
  продлевает цикл не больше чем на 14 дней.

Пороги и тексты правил находятся в `packages/core/src/progression.ts`,
`packages/core/src/pause.ts`, `packages/core/src/cycle-review.ts` и
`packages/core/src/safety.ts`. Менять их можно только вместе с тестами и
записью решения.

## LLM

LLM не пишет план и не пишет в БД. Она разбирает текст, нормализует упражнение,
задаёт уточнения и объясняет уже выбранную рекомендацию. Сервер:

1. валидирует JSON Schema;
2. сверяет ID, роли и связи с планом;
3. пересчитывает числа;
4. отклоняет ответ при расхождении;
5. при ошибке/таймауте использует локальный парсер.

Версии провайдера, модели, промпта, схемы и правил сохраняются в `llm_calls` и
`audit_events`.

Golden dataset — 50 кейсов. `npm run test:llm-eval` считает точность упражнения
и подходов, numeric accuracy, red/yellow recall, invalid JSON и scope
violations. Гейт: red recall 100%, yellow ≥95%, numeric ≥98%, invalid JSON
≤0,5%, scope 100%. `LLM_ENABLED=0` — kill switch; при 80% любого бюджета в лог
пишется `llm_budget_alert`, при 100% — локальный fallback.

## Безопасность и данные

- Продукт не даёт диагнозов и не оценивает «безопасность» боли.
- Red-флаги: боль в груди, обморок, выраженная одышка, неврологические
  симптомы, острая травма, лихорадка.
- Проект некоммерческий: нет платежей, рекламы, продажи данных и коммерческой
  аналитики.
- Собираются только аккаунт, профиль, тренировки, wellness и текст для LLM.
  Это персональные данные; они обрабатываются минимально и только для работы
  дневника. Проект не заявляет о «нулевой обработке ПД» (см. ADR-004).
- Сырой текст LLM — 90 дней, audit — 365 дней, логи — 30 дней.
- Экспорт JSON и удаление аккаунта доступны в настройках.
- Внешние сервисы: LLM (минимизированный контекст), email-провайдер, S3-бэкапы.
- Сторонняя аналитика и реклама не подключены.
- Magic link: 15 минут, одно использование, в БД только SHA-256 хэш; не более
  5 ссылок на email за 15 минут и не чаще одной в 30 секунд. Новые email
  ограничены `ALPHA_EMAIL_ALLOWLIST`.
- Сессия: httpOnly JWT, `SameSite=Lax`, 30 дней, ротация раз в 7 дней.
- CSRF: небезопасные методы с чужим `Origin`/`Referer` получают `403`.
- Удалённый аккаунт не восстанавливается magic link; email анонимизируется.
  Повторный вход на тот же email создаёт новый аккаунт.
- Production не стартует без `AUTH_SECRET` ≥32 символов, HTTPS `APP_URL` и
  явного решения по email: провайдер или `EMAIL_PROVIDER=none`; `console`
  запрещён.
- Alpha-домен закрыт от индексации: `robots.txt` с `Disallow: /`,
  `X-Robots-Tag: noindex` и meta robots.

## Ограничения текущего среза

- Нет импорта произвольной программы и генерации с нуля.
- Нет голосового ввода.
- Нет автоматического удаления/возврата подсобки через отдельное решение:
  пользователь может пропустить подсобку, слот остаётся пустым.
- Настройки оборудования (высота сиденья, фиксатор) пока не вводятся в UI;
  сопоставимость идёт по варианту упражнения и режиму нагрузки.
- Перенос даты, возврат после паузы и пересмотр цикла реализованы по
  `ADR-002`; ручной пересмотр доступен на `/cycle/review`.
- Следующий цикл начинается с текущих весов и сбрасывает целевые повторы.
  Автоматический «шаг вверх» не применяется: это консервативное решение.
- Пересборка после паузы >24 недель не подставляет вес: все нагрузки требуют
  калибровки.
- Офлайн-очередь подходов не реализована; PWA кэширует оболочку и работает
  онлайн для записи.
- Golden parser dataset: 50 эталонных текстовых кейсов; всего 143 теста.
  Живой LLM-eval прошёл на staging: numeric 99%, red/yellow 100%, invalid JSON
  0% после retry.
- Telegram и LLM требуют внешних ключей; без них приложение работает в
  локальном/детерминированном режиме.
- Связка Telegram с существующим Web-аккаунтом по короткому коду — P1-B.
- IP rate limit хранится в памяти процесса; для нескольких инстансов нужен
  общий store.
- Live staging развёрнут; остались `/setdomain` для Login Widget и проверка на
  реальных iOS Safari и Android Chrome.
- PWA и Telegram не проверены на реальных iOS Safari и Android Chrome.

## Проверки

Приёмочный гейт P1-A:

```bash
npm run typecheck
npm test
npm run test:llm-eval
npm run build
npm run test:cycle
npm run test:e2e
```

Последний сквозной тестовый цикл: [`docs/testing/cycle-002-2026-10-24.md`](docs/testing/cycle-002-2026-10-24.md)
(28/23 сессии, 106 доменных тестов, 22 Playwright-сценария, CI).
P1-A: [`docs/testing/p1-alpha-readiness-2026-10-25.md`](docs/testing/p1-alpha-readiness-2026-10-25.md)
(143 теста, 50 golden-кейсов, 35 Playwright-сценариев, live LLM eval и restore-drill).
Предыдущий цикл: [`docs/testing/cycle-001-2026-10-24.md`](docs/testing/cycle-001-2026-10-24.md).
Технический отчёт сессии: [`docs/reports/technical-session-2026-10-24.md`](docs/reports/technical-session-2026-10-24.md).

Тесты: `packages/core/src/*.test.ts` — метрики, тоннаж, границы, safety,
прогрессия, независимость основных движений, календарь, шаблон, парсер,
перенос, пауза/возврат и пересборка цикла.

## Деплой

Текущий alpha-staging — native-контур: Node 24 + Next.js под systemd,
PostgreSQL 17 на loopback, Nginx vhost за HAProxy SNI, Let's Encrypt,
ежедневный `pg_dump` и restore-drill. Код, env и бэкапы — в `/opt/chiron`;
подробности и команды обновления —
[`docs/runbooks/staging.md`](docs/runbooks/staging.md).

`Dockerfile` собирает standalone-образ Next.js. `docker-compose.prod.yml` —
минимальный production-контур; `docker-compose.staging.yml` добавляет Caddy с
автоматическим TLS, healthcheck, отдельную БД и backup-профиль — альтернатива
для будущего деплоя.

```bash
cp .env.staging.example .env.staging
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
./scripts/backup-db.sh
RESTORE_CONFIRM=YES ./scripts/restore-db.sh backups/chiron-<UTC>.dump
```

Перед публикацией задайте сильный `AUTH_SECRET`, HTTPS `APP_URL`, пароль БД и
явное решение по email (провайдер или `EMAIL_PROVIDER=none`). Приложение не
стартует при небезопасной production-конфигурации. Для 152-ФЗ размещайте БД и
приложение в РФ; LLM-вызовы требуют отдельного согласия.
