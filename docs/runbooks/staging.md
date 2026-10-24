# Staging runbook

- **Назначение:** staging для 3–5 приглашённых тестеров.
- **Статус:** P1-A, конфигурация подготовлена; живой прогон с доменом и TLS —
  P1-B.
- **Связанные документы:** [`ADR-003`](../decisions/ADR-003-alpha-security-and-operations.md),
  [`P1-agent-brief`](../tasks/P1-agent-brief.md).

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
# EMAIL_*, TELEGRAM_*, GEMINI_API_KEY, LLM_*
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
  `LLM_EVAL_LIVE=1 GEMINI_API_KEY=… npm run test:llm-eval`.
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

Учебная тревога перед допуском тестеров:

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

## 8. Допуск тестеров

1. Добавить Telegram username/id в `TELEGRAM_ALLOWLIST`.
2. Добавить email-тестеров в `ALPHA_EMAIL_ALLOWLIST` (точный адрес или
   `*@domain`) и перезапустить web. Пустой список в production не проходит
   startup validation.
3. Для email-тестеров создать magic link вручную только если провайдер
   недоступен; ссылка действует 15 минут.
4. Проверить вход на iOS Safari и Android Chrome.
5. Записать тестера, устройство, дату и результат.
6. Публичную регистрацию не открывать.

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
- Связка Telegram с существующим Web-аккаунтом по коду — P1-B.
- PWA и Telegram не проверены на реальных iOS/Android в этой сессии.
- Некоммерческий статус и границы данных зафиксированы в
  [`ADR-004`](../decisions/ADR-004-non-commercial-and-data-scope.md).
  Юридические документы и согласие на LLM для текущего серверного контура —
  P1-B; для буквального zero-PD нужен отдельный локальный контур.
