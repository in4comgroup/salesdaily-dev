# Спецификация: только Yandex, конфигурация AI в БД вместо JSON-файлов

Статус: **согласовано, в работе**. Дата: 11 ноября 2026 года.

| Этап (раздел 8) | Статус |
| --- | --- |
| 1. Только Yandex | Реализован 2026-11-11, проверен локально (тесты, реальный текстовый запрос к Yandex); ждёт деплоя на стенд |
| 2. Конфигурация в БД | Не начат |
| 3. Админка «Маршруты ИИ» | Не начат |
| 4. Удаление старого | Не начат (после проверки 2–3 на стенде) |

Связанные документы: [architecture.md](architecture.md) (как runtime работает сейчас), [metering-and-billing.md](metering-and-billing.md) (что уже хранится в БД).

## 1. Решения

| # | Решение | Дата |
| --- | --- | --- |
| 1 | Используем одно подключение — **Yandex AI Studio API**. Vercel AI Gateway (Google / OpenAI / Anthropic) и Google Search удаляются из кода после проверки, что их ничто не использует (раздел 3) | 2026-11-11 |
| 2 | Адрес Yandex AI Studio API задаётся env-переменной `YANDEX_AI_API_URL` | 2026-11-11 |
| 3 | Маршруты (модели, задачи, функции, сервисы) и URI моделей хранятся в БД; админ меняет их в «Настройки → Модели» | 2026-11-11 |
| 4 | Если при старте нет рабочей конфигурации: AI выключен, CRM работает | 2026-11-11 |
| 5 | Старые JSON-файлы удаляются **после** того, как новая логика проверена на стенде (раздел 8, этап 4) | 2026-11-11 |

## 2. Почему сейчас нужны JSON-файлы

В БД сейчас нет конфигурации маршрутов. Там только цены, журнал вызовов, лимиты и настройки Topics ([metering-and-billing.md](metering-and-billing.md)). Маршруты задаёт JSON по `AI_CONFIG_PATH`:

- [deploy/k8s/app/ai-config.json](../../deploy/k8s/app/ai-config.json) — то, что работает на кластере (ConfigMap `crm-ai-config`, смонтирован в `/etc/crm-ai/`).
- [config/ai/yandex.json](../../config/ai/yandex.json) — исходный профиль, все новые функции выключены. `tools/ai/profile.ts` строит из него файл для кластера; тесты читают его как эталон.
- [config/ai/blocked.json](../../config/ai/blocked.json) — «AI выключен», для тестов.

Минусы: любое изменение требует коммита, деплоя и перезапуска pod; два файла связаны только ручным запуском `profile`; админ не видит маршруты в UI.

## 3. Только Yandex: что удаляется

### 3.1 Где сейчас используется Vercel Gateway

Проверено поиском по коду 11 ноября 2026 года. В рабочей конфигурации кластера подключение `vercel` не используется. Код остаётся только как запасные ветки:

| Место | Что делает | После изменения |
| --- | --- | --- |
| [adapters/vercel-gateway.ts](../../src/server/ai/adapters/vercel-gateway.ts) | Адаптер AI SDK к `ai-gateway.vercel.sh` | Удалить |
| [resolve.ts](../../src/server/ai/resolve.ts) — `resolveGoogleSearch()`, выбор адаптера по `connection.adapter` | Модель Gemini с Google Search через Gateway | Удалить метод и ветку |
| [web-search.ts](../../src/server/web-search.ts) | Если сервис `search` выключен — Gemini + `google.tools.googleSearch` | Только Yandex Search API. Сервис выключен → веб-поиск недоступен (понятная ошибка), без Google |
| [clients.ts](../../src/server/clients.ts) `lookupClientOnWeb` | То же для исследования компании | То же: только Yandex Search API |
| `@ai-sdk/google` в `package.json` | Фабрика инструмента Google Search | Удалить зависимость |
| [config.ts](../../src/server/ai/config.ts) | Адаптер `vercel-gateway`; возможности `googleSearch`, `pdf`, `audio`, `video` (нативный ввод файлов есть только у моделей Gateway) | Удалить. Возможности моделей: `text`, `structuredOutput`, `tools`, `streaming`, `image` |
| Режимы `native` для PDF / аудио / видео ([media.ts](../../src/server/ai/media.ts), [av.ts](../../src/server/ai/av.ts)) | Файл напрямую в модель — только Gateway | Удалить ветки. PDF — только OCR, аудио — только SpeechKit, задача `parseVideo` всегда выключена (как сейчас при `video=disabled`) |
| `assertChatContentAllowed(messages, adapter)` в чате и аналитике | Файлы в чате разрешены только для Gateway | Параметр `adapter` убрать; файлы в чате запрещены (как сейчас для Yandex) |
| `AI_GATEWAY_API_KEY` в `env.example` и Secret `crm-env` | Ключ Gateway | Удалить из `env.example`; из Secret удаляет оператор |
| `tools/ai/gateway-fixture.ts` и 12 тестов на нём | Политика и адаптер Gateway | Тесты политики перевести на Yandex-фикстуру; тесты адаптера Gateway и фикстуру удалить |
| `AGENTS.md` (AI Gateway в Tech Stack), `src/app/CLAUDE.md`, `src/lib/CLAUDE.md`, `docs/ai/*` | Описание Gateway | Обновить |

Перед удалением — повторный `git grep` по `vercel-gateway`, `resolveGoogleSearch`, `@ai-sdk/google`, `AI_GATEWAY_API_KEY`, `googleSearch`. Удаляем, только если нет других мест.

### 3.2 Понятие «подключения» исчезает из конфигурации

Сейчас в JSON есть `connections`, `policy.allowedConnections` и `connectionId` у моделей и сервисов. При одном провайдере это лишнее. Подключение Yandex задаётся в коде (`src/server/ai/yandex-connection.ts`): адаптер, пути API, имена env ключей. Админ в UI не может направить запрос к другому провайдеру — такого пути в коде нет.

### 3.3 Адрес API — env-переменная

| Переменная | Значение по умолчанию | Назначение |
| --- | --- | --- |
| `YANDEX_AI_API_URL` | `https://ai.api.cloud.yandex.net` | Origin Yandex AI Studio API |

- Chat Completions: `${YANDEX_AI_API_URL}/v1/chat/completions`.
- Vision OCR (тот же хост): `${YANDEX_AI_API_URL}/ocr/v1/recognizeTextAsync` и `/ocr/v1/getRecognition`.
- Проверка при старте: только `https://`, только origin (без пути, query, логина и пароля). Неверное значение → AI выключен, причина в логе и в «Модели».
- Остаётся как сейчас: адаптер отправляет запросы только на этот адрес, редиректы запрещены, заголовок `x-data-logging-enabled: false`.
- Не задана → значение по умолчанию и запись в лог при старте. Так деплой не ломается, если переменную забыли добавить.
- Другие хосты Yandex остаются фиксированными в коде: SpeechKit (`stt.api.cloud.yandex.net`), операции (`operation.api.cloud.yandex.net`), Search API (`searchapi.api.cloud.yandex.net`), IAM и Billing ([billing.ts](../../src/server/ai/billing.ts)). Их перенос в env — отдельное решение, если понадобится.

## 4. Что хранится где после изменения

| Данные | Где |
| --- | --- |
| Адаптер Yandex, пути API, имена env ключей (`YANDEX_AI_API_KEY`, `YANDEX_OCR_API_KEY`, `YANDEX_SPEECH_API_KEY`, `YANDEX_SEARCH_API_KEY`) | Код |
| Адрес API, ключи, каталог (`YANDEX_AI_API_URL`, `YANDEX_AI_API_KEY`, `YANDEX_AI_FOLDER_ID`, ключи сервисов) | env / Secret `crm-env` |
| Модели (ID, подпись, **URI**, возможности, вкл/выкл), задачи, функции, сервисы, параметры обработки файлов | БД, `ai_config_version` |
| Цены, журнал, лимиты, наценка | БД (без изменений) |

`YANDEX_AI_TEXT_MODEL_URI` и `YANDEX_AI_VISION_MODEL_URI` больше не нужны после переноса URI в БД (раздел 6.2).

## 5. Модель данных

Миграция `0004_ai_config_version.sql` — только добавляет объекты, безопасна для rolling deploy:

```sql
CREATE TABLE "public"."ai_config_version" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "config" jsonb NOT NULL,
  "comment" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" text REFERENCES "public"."user"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "ai_config_version_one_active_uidx"
  ON "public"."ai_config_version" ("is_active") WHERE "is_active";
-- + триггер BEFORE DELETE: активную версию удалить нельзя (защита от ручного SQL).
```

- Активна ровно одна строка. Строки не меняются, кроме флага `is_active`. Новая конфигурация — новая строка; переключение активной — одна транзакция.
- Начальная версия: та же миграция вставляет активную строку = текущий `deploy/k8s/app/ai-config.json` в новой схеме (раздел 5.1). URI моделей в ней пустые (миграция не читает env) — их заполняет первый старт (раздел 6.2).

### 5.1 Документ конфигурации (схема версии 2)

```jsonc
{
  "version": 2,
  "features": { "webSearch": true, "websiteFetch": false, "browserSpeechRecognition": false, "serverSpeechRecognition": true },
  "files": { "images": "vision", "maxMediaSeconds": 180, "pdfMaxPages": 10 },
  "services": { "ocr": true, "speech": true, "search": true },
  "models": {
    "yandex-text":   { "enabled": true, "label": "…", "uri": "gpt://<folder>/…", "capabilities": ["text", "structuredOutput", "tools", "streaming"] },
    "yandex-vision": { "enabled": true, "label": "…", "uri": "gpt://<folder>/…", "capabilities": ["text", "image"] }
  },
  "tasks": { "chat": { "enabled": true, "defaultModel": "yandex-text", "allowedModels": ["yandex-text"] } }
}
```

- Нет `connections`, `allowedConnections`, `connectionId`, `credentialsEnv`, `upstreamModelIdEnv`, нет режимов `native` для PDF / аудио / видео.
- Проверка — строгая Zod-схема `aiConfigDocumentSchema`, как сейчас: неизвестные поля, битые ссылки, задача без разрешённой модели по умолчанию — отказ.
- URI модели: `gpt://<YANDEX_AI_FOLDER_ID>/...`; проверка «URI в каталоге из env» остаётся.

## 6. Как runtime получает конфигурацию

### 6.1 Загрузка и обновление

`getAiRuntime()` синхронный и вызывается из 32 мест. Чтобы не менять вызовы:

1. Новый модуль `src/server/ai/config-store.ts` — единственное место, которое читает `ai_config_version`.
2. Старт (`instrumentation.ts`): `await loadActiveAiConfig()` → строит runtime → кэш процесса.
3. Каждые 30 с: `SELECT id FROM ai_config_version WHERE is_active`. Изменился `id` → читает документ, строит новый runtime и **атомарно заменяет** кэш. Начатые вызовы дорабатывают на старом объекте.
4. `getAiRuntime()` возвращает текущий кэш.

| Ситуация | Поведение |
| --- | --- |
| Старт: БД недоступна, нет активной строки, документ неверен или нет нужного env | AI выключен (задачи отклоняются `AiPolicyError`), CRM работает; причина в логе и в «Модели»; повтор каждые 30 с |
| Обновление: БД недоступна или новая версия неверна | Остаётся последняя рабочая конфигурация; причина в логе и в «Модели» |

Когда «нет рабочей конфигурации» возможно при правильной миграции:

- БД недоступна при старте pod (сеть, обслуживание, нет свободных соединений).
- Из Secret убрали или переименовали ключ, сменили `YANDEX_AI_FOLDER_ID` (URI моделей больше не в каталоге) или задали неверный `YANDEX_AI_API_URL`.
- Новая версия кода изменила схему документа без миграции документа. Правило: смена схемы всегда идёт вместе с миграцией.
- Таблицу изменили прямым SQL в обход проверки UI.

Ошибка админа в UI к этому не ведёт:

- В UI нет удаления: каждое сохранение — новая версия; любую прошлую можно сделать активной.
- Сохранение проходит только после полной проверки (раздел 7).
- Выключить все задачи — корректная конфигурация «AI выключен»; вернуть — откатом версии.
- Удалить активную строку нельзя даже SQL (триггер).

### 6.2 Перенос URI моделей из env

Первый старт нового кода: если у включённой модели в активной версии пустой `uri`, store берёт его из старой env (`YANDEX_AI_TEXT_MODEL_URI` для `yandex-text`, `YANDEX_AI_VISION_MODEL_URI` для `yandex-vision`), проверяет и сохраняет **новой версией** с комментарием «URI из env». Параллельные pod не создают дубли: транзакционная advisory-блокировка и повторная проверка внутри неё. После этого env с URI не нужны (удаляются на этапе 4).

## 7. Админка

Новый блок «Маршруты ИИ» в «Настройки → Модели», только админ платформы:

- **Задачи**: процесс (`TASK_LABELS`), вкл/выкл, модель по умолчанию, разрешённые модели.
- **Модели**: ID, подпись, URI, возможности, вкл/выкл; «Добавить модель» (другая модель из каталога Yandex).
- **Функции и сервисы**: веб-поиск, голосовой ввод, OCR, SpeechKit, Search API; режим изображений; лимиты страниц и секунд.
- **Сохранить** с комментарием. Сервер: (1) схема; (2) сборка runtime с текущим env без сети — проверяет зависимости, ключи и URI; (3) только при успехе — новая активная версия.
- **История версий**: дата, автор, комментарий, «Сделать активной».
- **Состояние**: активная версия, версия на этом pod, последняя ошибка загрузки.

API: `GET/POST /api/admin/llm/routing`, `POST /api/admin/llm/routing/activate` (`{ id }`). Логика — `src/server/admin-llm-routing.ts`, без ORM в маршрутах.

Связь с уже сделанным: `configuredUpstreamModels()` в [llm-pricing.ts](../../src/server/llm-pricing.ts) переходит с `loadAiConfig()` на текущий runtime. Ключ цены прежний (URI без каталога).

## 8. План работ

Каждый этап — отдельная поставка; коммит и деплой делает пользователь.

| Этап | Содержание | Проверка | Оценка |
| --- | --- | --- | --- |
| **1. Только Yandex** | Раздел 3: удалить Gateway, Google Search, `@ai-sdk/google`, режимы `native`, `connections`; добавить `YANDEX_AI_API_URL`. Конфигурация пока в JSON, но в новой схеме (версия 2): `deploy/k8s/app/ai-config.json` и `config/ai/*.json` пересобрать | Тесты `tools/ai` на Yandex-фикстуре; `tsc`, ESLint; `git grep` без остатков Gateway; локальный старт; на стенде — чат, разбор PDF, поиск | 1–1,5 дня |
| **2. Конфигурация в БД** | Миграция 0004 + начальная версия; `config-store.ts`; перенос URI из env; обновление каждые 30 с; `configuredUpstreamModels()` на runtime. JSON и ConfigMap ещё в манифестах, новый код их не читает | PG17: миграция с нуля и поверх 0003, повтор без изменений, триггер; тесты store (нет строки, новая версия, неверная версия, БД недоступна); стенд: AI работает на версии из БД | 1,5 дня |
| **3. Админка «Маршруты ИИ»** | API + UI + история и откат | Стенд: изменить задачу → действует на обоих pod за ≤ 30 с; откат; неверное сохранение отклоняется | 1,5–2 дня |
| **4. Удаление старого** (после проверки этапов 2–3 на стенде) | Удалить `deploy/k8s/app/ai-config.json`, `configMapGenerator crm-ai-config`, volume, mount и `AI_CONFIG_PATH` в `deployment.yaml`, `config/ai/yandex.json`, `config/ai/blocked.json` (тестовые данные → фикстуры в `tools/ai/`), `tools/ai/profile.ts` и команду `profile`, `loadAiConfig()`; из `env.example` — `YANDEX_AI_TEXT_MODEL_URI`, `YANDEX_AI_VISION_MODEL_URI`. `deploy.yml` / `dev.yml` не трогаем | Стенд после деплоя: AI работает без ConfigMap | 0,5 дня |

Итого около 5 рабочих дней. CLI `tools/ai/check.ts` остаётся: проверяет документ из файла (`--config`) или активную версию в БД.

Действия оператора:

- После этапа 1: при желании добавить `YANDEX_AI_API_URL` в `crm-env` (без неё — значение по умолчанию); удалить `AI_GATEWAY_API_KEY` из `crm-env`.
- После этапа 4: удалить `YANDEX_AI_TEXT_MODEL_URI` и `YANDEX_AI_VISION_MODEL_URI` из `crm-env`; удалить ConfigMap: `kubectl -n salesdaily delete configmap crm-ai-config` (у `github-deployer` нет права на удаление).

## 9. Выкатка и откат

- **Этап 1** меняет формат JSON. Код и JSON нового формата выходят в одном образе и одном деплое; ConfigMap обновляет тот же `kubectl apply`. Откат = прошлый образ + прошлый JSON (тот же коммит).
- **Этап 2**: таблица добавляется; старые pod её не читают, новые не читают ConfigMap. Откат = прошлый образ; ConfigMap ещё на месте.
- **Этап 4** — только после проверки этапов 2–3. После него откат на образ до этапа 2 потребует вернуть ConfigMap.

## 10. Что не меняется

Обязательные возможности задач ([registry.ts](../../src/server/ai/registry.ts)), адаптер Yandex по сути, `meterModel`, учёт, цены, лимиты, наценка, каталог моделей для UI (`/api/ai/config`, `useAiModels`), авторизация и изоляция организаций.
