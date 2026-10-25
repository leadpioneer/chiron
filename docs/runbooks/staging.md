# Staging runbook

- **Назначение:** staging для личного контура (автор и его близкий человек).
  Расширение до 3–5 тестеров — отдельное решение.
- **Статус:** P1-A, конфигурация подготовлена; живой прогон с доменом и TLS —
  P1-B.
- **Связанные документы:** [`ADR-003`](../decisions/ADR-003-alpha-security-and-operations.md),
  [`P1-agent-brief`](../tasks/P1-agent-brief.md).

## 0. Текущий alpha-контур (native)

- **Код:** `/opt/chiron/app` (git `main`).
- **Node:** `/opt/chiron/node` (Node 24).
- **Env:** `/opt/chiron/.env.staging`, владелец `root:chiron`, режим `640`;
  значения не публикуются.
- **Сервис:** systemd `chiron`, слушает `127.0.0.1:3000`.
- **БД:** PostgreSQL 17 на loopback; роль и база `chiron`.
- **TLS/маршрутизация:** Nginx vhost за HAProxy SNI, сертификат Let's Encrypt
  с автоматическим продлением.
- **Noindex:** `robots.txt`, `X-Robots-Tag`, meta robots.
- **Бэкапы:** `/opt/chiron/backup.sh`, cron ежедневно, retention 14 дней;
  restore-drill выполнен в отдельную БД.

Обновление:

```bash
sudo -u chiron git -C /opt/chiron/app pull --ff-only
cd /opt/chiron/app
sudo -u chiron env PATH=/opt/chiron/node/bin:/usr/bin:/bin HOME=/opt/chiron \
  npm run build
sudo systemctl restart chiron
curl -fsS http://127.0.0.1:3000/api/health
```

Фактический домен, Telegram id и ключи хранятся только в серверном env и
приватных заметках владельца. В репозиторий они не попадают.

## 1. Предусловия

- VPS в РФ, Docker Engine 24+ и Compose v2.
- Домен, A-запись которого указывает на VPS.
- Открыты только `80/tcp`, `443/tcp` и `443/udp`; PostgreSQL наружу не
  публикуется.
- S3-совместимый bucket или удалённый каталог для копий бэкапов.
- Значения из [`.env.staging.example`](../../.env.staging.example).

## 2. Первый запуск

```bash
cp .env.staging.example .env.staging
chmod 600 .env.staging
# заполнить POSTGRES_PASSWORD, AUTH_SECRET, APP_URL, DOMAIN, ACME_EMAIL,
# EMAIL_*, TELEGRAM_*, LLM_* (провайдер, base URL, ключ, модель)
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
docker compose -f docker-compose.staging.yml --env-file .env.staging ps
```

Проверка:

```bash
curl -fsS https://$DOMAIN/api/health
```

Ожидаемый ответ: `{"ok":true,"db":"up","llm":{...}}`.

Bootstrap-контейнер применяет миграции и seed. Если он упал, приложение не
стартует: смотрите `docker compose logs bootstrap`.

## 3. Секреты

- `.env.staging` не коммитится и не попадает в Docker-образ.
- `AUTH_SECRET` — минимум 32 случайных символа; смена завершает все сессии.
- Пароль PostgreSQL и ключи провайдеров хранятся только на сервере.
- Для production `AUTH_DEV_MODE` должен быть `0`; при `1` приложение не
  стартует.
- `APP_URL` должен быть `https://…`, иначе startup validation падает.

## 4. LLM

- `LLM_ENABLED=0` — мгновенный kill switch, локальный парсер продолжает
  работать.
- Бюджеты: `LLM_DAILY_BUDGET_USD`, `LLM_MONTHLY_BUDGET_USD`,
  `LLM_GLOBAL_MONTHLY_BUDGET_USD`.
- При 80% бюджета в лог пишется `llm_budget_alert`; при 100% — fallback.
- Golden dataset: `npm run test:llm-eval` (50 кейсов). Живой прогон:
  `LLM_EVAL_LIVE=1 LLM_PROVIDER=openai LLM_BASE_URL=… LLM_API_KEY=… LLM_MODEL=… npm run test:llm-eval`.
- Модель меняется только решением владельца; версия сохраняется в `llm_calls`.

## 5. Бэкап

Ежедневно:

```bash
./scripts/backup-db.sh
```

Скрипт пишет `backups/chiron-<UTC>.dump`, удаляет файлы старше
`BACKUP_RETENTION_DAYS` (по умолчанию 14) и, если задан `RCLONE_REMOTE`,
копирует дампы в удалённое хранилище.

Пример cron:

```cron
15 3 * * * cd /opt/chiron && RCLONE_REMOTE=s3:chiron-backups ./scripts/backup-db.sh >> /var/log/chiron-backup.log 2>&1
```

Проверка свежести:

```bash
find backups -name 'chiron-*.dump' -mtime -1 -print
```

## 6. Восстановление и учебная тревога

Восстановление разрешено только для staging/test или с явным
`ALLOW_PROD_RESTORE=1`. Остановите web, чтобы приложение не писало в БД во
время `pg_restore`:

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging stop web
RESTORE_CONFIRM=YES ./scripts/restore-db.sh backups/chiron-20261025T031500Z.dump
docker compose -f docker-compose.staging.yml --env-file .env.staging start web
curl -fsS https://$DOMAIN/api/health
```

Учебная тревога перед допуском личного круга:

1. Снять бэкап.
2. Создать тестовую запись (например, завершить сессию тестового атлета).
3. Восстановить дамп.
4. Убедиться, что тестовая запись исчезла, а данные до бэкапа на месте.
5. Записать дату, дамп и результат в журнал инцидентов.

## 7. Мониторинг и алерты

Минимум для alpha:

- внешний probe `/api/health` каждую минуту; алерт после 3 неудач;
- `docker compose ps` — контейнеры `db`, `web`, `caddy` здоровы;
- свободное место на диске >20%;
- возраст последнего бэкапа <36 часов;
- в логах нет роста `email_failed`, `llm_budget_alert`, 5xx;
- Caddy JSON-логи хранятся не менее 30 дней.

Проверка вручную:

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging ps
docker compose -f docker-compose.staging.yml --env-file .env.staging logs --tail=100 web
```

## 8. Допуск личного круга

1. Добавить Telegram id/username партнёрши в `TELEGRAM_ALLOWLIST`.
2. Email — не alpha-путь. `ALPHA_EMAIL_ALLOWLIST` оставить пустым или только
   для владельца; новые email-регистрации блокируются.
3. Magic link вручную — только владельцу, если нужен технический вход.
4. Проверить вход через TMA на iOS Safari и Android Chrome.
5. Записать пользователя, устройство, дату и результат.
6. Публичную регистрацию не открывать.

### 8.1. Запрет индексации

Текущий staging: `https://fit.leadpioneer.ru`.

- `/robots.txt` отдаёт `Disallow: /`;
- все ответы содержат `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet,
  noimageindex`;
- страницы отдают `<meta name="robots" content="noindex, nofollow">`.

Проверка:

```bash
curl -fsS https://fit.leadpioneer.ru/robots.txt
curl -fsSI https://fit.leadpioneer.ru/login | grep -i x-robots-tag
```

Не добавлять домен в поисковые панели и не публиковать ссылки в индексируемых
местах.

### 8.2. Telegram-напоминания

- Cron `/etc/cron.d/chiron-reminders` запускает
  `/opt/chiron/reminders.sh` в 16:00 по времени сервера
  (`Europe/Moscow`).
- Скрипт отправляет сообщение только пользователям с Telegram identity и
  `PLANNED`-сессией на сегодня; повторный запуск в тот же день не дублирует
  сообщение благодаря audit `REMINDER_SENT`.
- Входящий webhook от Telegram на этом хосте получал `Connection timed out`,
  поэтому callback-и забирает long polling service `chiron-telegram-poll`
  через `getUpdates` и исходящий прокси. Поллер передаёт update в локальный
  `POST /api/telegram/webhook`.
- Inline-кнопки «Отложить на завтра» и «Окей» обрабатывает локальный webhook:
  проверяет secret и владельца сессии, переносит сессию или удаляет сообщение.
- Offset хранится в `/opt/chiron/telegram-offset`; перезапуск не теряет
  обработанные callback-и.
- Исходящие вызовы Telegram API идут через `TELEGRAM_PROXY_URL`
  (`http://127.0.0.1:2080` на staging).
- Управление поллером:

```bash
sudo systemctl status chiron-telegram-poll --no-pager
sudo systemctl restart chiron-telegram-poll
sudo journalctl -u chiron-telegram-poll -n 50 --no-pager
```
- Проверка без отправки: `send-reminders.mts --dry-run`.
- Тест только владельцу: `--test-telegram-id=<id>`; другим пользователям
  сообщения не отправляются.

## 9. Обновление

```bash
git pull --ff-only
docker compose -f docker-compose.staging.yml --env-file .env.staging build web
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d web caddy
curl -fsS https://$DOMAIN/api/health
```

Миграции выполняются только через `bootstrap`; перед обновлением снять бэкап.

## 10. Известные ограничения P1-A

- IP rate limit хранится в памяти процесса; при нескольких инстансах нужен
  общий store.
- Связка Telegram с существующим Web-аккаунтом отложена на неопределённый
  срок; alpha-путь — только Telegram Mini App
  ([`ADR-007`](../decisions/ADR-007-tma-only-and-personal-data-scope.md)).
- TMA проверена на iPhone 25.10.2026; Android не проверен.
- Некоммерческий статус и границы данных зафиксированы в
  [`ADR-004`](../decisions/ADR-004-non-commercial-and-data-scope.md). Для
  личного использования (автор и его близкий человек — партнёрша) действует
  исключение ч. 2 ст. 1 152-ФЗ по позиции владельца; при расширении до 3–5
  тестеров нужны юридические документы и проверка
  ([`ADR-007`](../decisions/ADR-007-tma-only-and-personal-data-scope.md)).
  В LLM уходит только обезличенный текст без идентификаторов; активный
  routerai, Gemini выключен.
