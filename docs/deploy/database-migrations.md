# Миграции PostgreSQL

## Решение и фактическое исходное состояние

PostgreSQL 17, Drizzle ORM 0.45 / drizzle-kit 0.31, node-postgres 8.16.
До внедрения: ручные SQL и полный dump, нет журнала/runner; `dev.yml`
применяет Deployment без миграции. Две реплики, RollingUpdate, Secret `crm-env`.
Deployer не читает Secrets и не имел прав на Jobs. Старые имена workflow
в комментариях манифестов не соответствуют действующему `dev.yml`.

Выбран небольшой SQL runner на существующем `pg`. Drizzle поддерживает
[custom migrations](https://orm.drizzle.team/docs/kit-custom-migrations), поэтому
ручные объекты сами по себе не исключают Drizzle. Однако здесь нет его исходной
истории/snapshots; нужны явная регистрация, проверка контрольных сумм всей истории
и запрет запуска старого набора SQL. Это явно реализовано одним runner.
Не использовать одновременно `drizzle-kit migrate` и этот runner.
`drizzle-kit push` запрещён для стендов: Search V2 отсутствует в ORM-модели.

## Файлы и журнал

Единственная последовательность — `db/migrations/manifest.json`. Первые два пути
ссылаются на **неизменённые** исторические `db/baseline/0000_baseline.sql` и
`0001_deal_funnel_stage_settings.sql`. Новые файлы: `db/migrations/0002_name.sql`
и далее; номера непрерывны. Каждый файл необходимо добавить в конец manifest.
Диагностический `db/baseline/crm-current-schema.sql` не включён в manifest,
никогда не исполняется и снят до 0001. Каталог `existing-schema.json` — эталон
для регистрации именно состояния 0000+0001, не очередная миграция.

Журнал: `crm_migrations.history` (имя, SHA-256 исходных байтов, время,
флаг регистрации). Проверяется весь префикс истории: изменение/удаление файла,
перестановка или запуск более старого набора останавливают runner.
Не исправлять checksum в БД и не редактировать применённые SQL; исправление
выпускать новой миграцией. При аварийной утрате файла восстановить точные байты
из релиза/истории репозитория, затем повторить проверку.

Runner использует одно соединение и session advisory lock `734210981`
([PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS)).
Ожидание lock ограничено 5 секундами; конкурентный запуск либо последовательно
увидит готовую историю, либо завершится ошибкой для безопасного повтора.
На файл одна транзакция: SQL и запись истории фиксируются вместе.
Исторические BEGIN/COMMIT 0001 удаляются только в памяти точечным адаптером;
checksum относится к оригиналу. Новые файлы не содержат управления транзакциями.
Baseline требует `unaccent` и `pg_trgm`: runner создаёт расширения перед ним.
Пользователь БД должен иметь CREATE/DDL права и право устанавливать расширения;
если managed-сервис запрещает это, администратор заранее устанавливает их.

## Разработка

1. Изменить `src/db/schema.ts` для ORM-объектов и написать точечный SQL.
2. По необходимости использовать `drizzle-kit generate` только для черновика
   в `tmp/drizzle-drafts` (не журнал деплоя). Без согласованного snapshot он может
   сгенерировать всю ORM-схему; не принимать результат целиком. Не подключать
   генерацию к действующему стенду и не использовать push/migrate.
3. Ревью SQL: влияние на блокировки, данные, старый код, generated-колонки,
   функции `immutable_unaccent`, `translit_cyr_lat`, `to_or_tsquery`, GIN/trigram
   индексы. Изменение schema.ts не должно удалять отсутствующие там объекты.
4. Добавить файл в manifest; проверить на пустой БД и на отдельной копии с
   реалистичным объёмом данных. Сделать backup и проверить восстановление перед
   потенциально сложным изменением. Для проверки не использовать существующий
   стенд и не копировать секреты/продуктивные персональные данные в CI.

Команды (DATABASE_URL задаётся безопасно вне логов, runner не читает `.env`):

```sh
node scripts/migrations/run.cjs status
node scripts/migrations/run.cjs apply
# Только disposable сервер; тест создаёт и удаляет собственные БД:
MIGRATION_TEST_DATABASE_URL="$TEST_DATABASE_URL" node scripts/migrations/test.cjs
bash scripts/migrations/test-deploy.sh
```

Не передавать действующий URL литералом в shell history, не включать `set -x`.
node-postgres понимает `sslmode=no-verify`; psql/pg_dump (libpq) — нет.
Для libpq отдельно подготовить строку с `sslmode=require` (или лучше
`verify-full` с доверенным CA). Не менять исходный Secret ради другого клиента,
не печатать URL и не отключать проверку сертификата глобально.

## Безопасные изменения

* Новая колонка: сначала nullable/совместимый DEFAULT; новый код выдерживает
  старые строки. Проверить блокировки на копии с рабочим объёмом.
* Backfill: отдельная управляемая задача с порциями, checkpoint, лимитом нагрузки
  и безопасным повтором. Не держать большой UPDATE внутри deployment Job.
  После проверки полноты отдельным релизом вводить NOT NULL/ограничение.
* Тип: оценить rewrite/lock. Для тяжёлого изменения новая колонка, двойная запись,
  backfill, переключение чтения, затем отдельный cleanup.
* Переименование: rolling deployment ещё исполняет старый код. Использовать
  expand/contract с периодом совместимости, не одномоментный RENAME.
* Удаление: сначала прекратить чтение/запись всеми поддерживаемыми версиями,
  выдержать окно отката, затем отдельная явно рассмотренная миграция.
* Enum: добавление значения и использование его в данных разделять коммитами
  миграций: новое значение нельзя использовать до фиксации транзакции.
* Долгие индексы/CONCURRENTLY не поддерживаются транзакционным runner. Планировать
  отдельно как ручную операцию с отдельным согласованием и проверкой результата;
  не вставлять COMMIT в файл для обхода. Последующая миграция может проверить
  существование/валидность индекса. Автоматических destructive/down migrations нет.

Миграции выполняются **до** запуска нового кода, пока старые реплики работают.
Каждый SQL обязан быть совместим со старым и новым кодом. Версия приложения
для отката также должна работать с уже расширенной схемой.

## Одноразовая регистрация существующего стенда

На стенде уже применены `0000_baseline.sql` и
`0001_deal_funnel_stage_settings.sql`. Сначала собрать образ **без деплоя**,
зарегистрировать историю отдельным Job, затем запустить обычный деплой.
Автоматический apply до регистрации откажется работать с непустой БД и
заблокирует rollout.

Команды выполнять из корня репозитория в одной Bash-сессии. Нужны Node.js,
Docker с buildx и `kubectl`. Операции GitHub выполняются вручную в браузере;
Docker должен быть авторизован в GHCR для чтения образа; kubeconfig оператора — указывать на нужный
кластер. Оператору нужны права применить RBAC, создать/читать Jobs и читать
логи их pods. Это операторские команды, не команды ограниченного CI deployer.
Значения DATABASE_URL получать не нужно: Job использует `crm-env` в кластере.

### 1. Выбрать релиз и собрать образ без деплоя

Изменения системы миграций должны уже находиться в выбранной удалённой ветке.
Локальный HEAD должен соответствовать коммиту этой ветки, для которого
собирается образ. На время процедуры не обновлять эту ветку и не пересобирать
выбранный tag.

В браузере открыть репозиторий → **Actions → build-and-deploy → Run workflow**:

- выбрать ветку с изменениями системы миграций;
- **build** — включить;
- **deploy** — выключить;
- **tag** — оставить пустым.

Запустить workflow и дождаться успешного завершения. На странице запуска
проверить SHA коммита, из которого собран образ. Его первые семь символов
используются в tag `dev-sha-XXXXXXX`. Если образ нужного коммита уже успешно
собран, повторная сборка не нужна.

В терминале задать tag именно этого образа и адрес GHCR-репозитория:

```bash
set -euo pipefail

RELEASE_TAG="dev-sha-XXXXXXX" # заменить XXXXXXX на первые 7 символов SHA сборки
IMAGE_REPOSITORY="ghcr.io/in4comgroup/salesdaily-dev"

# Зафиксировать digest собранного образа для регистрационных Jobs.
IMAGE_REF="$IMAGE_REPOSITORY:$RELEASE_TAG"
IMAGE_DIGEST=$(docker buildx imagetools inspect "$IMAGE_REF" \
  --format '{{json .Manifest.Digest}}' | tr -d '"')
[[ "$IMAGE_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]
export MIGRATION_IMAGE="$IMAGE_REPOSITORY@$IMAGE_DIGEST"
printf 'Registration image: %s\n' "$MIGRATION_IMAGE"
```

### 2. Применить RBAC администратором

Проверить, что выбран нужный kube-context, затем применить манифест:

```bash
kubectl config current-context
kubectl apply -f deploy/k8s/infra/github-deployer.yaml

# Проверка прав CI ServiceAccount; выполняется администратором с impersonation.
kubectl auth can-i create jobs.batch -n salesdaily \
  --as=system:serviceaccount:salesdaily:github-deployer
kubectl auth can-i get jobs.batch -n salesdaily \
  --as=system:serviceaccount:salesdaily:github-deployer
```

Обе проверки должны ответить `yes`. Манифест добавляет deployer права
`create/get` Jobs; права на чтение Secrets ему не выдаются.

### 3. Запустить Job регистрации из собранного образа

Следующая функция берёт существующий шаблон Job, задаёт уникальное имя,
зафиксированный digest и режим runner. Она не меняет Deployment или Secret.
Имена сохраняются в переменных для дальнейшей диагностики.

```bash
create_migration_job() {
  local mode="$1"
  local job_name="$2"
  MIGRATION_MODE="$mode" MIGRATION_JOB="$job_name" node <<'NODE' | kubectl create -f -
const fs = require('node:fs');
const job = JSON.parse(fs.readFileSync('deploy/k8s/migration-job.json', 'utf8'));
job.metadata.name = process.env.MIGRATION_JOB;
const container = job.spec.template.spec.containers[0];
container.image = process.env.MIGRATION_IMAGE;
container.command = ['node', 'scripts/migrations/run.cjs', process.env.MIGRATION_MODE];
console.log(JSON.stringify(job));
NODE
}

wait_migration_job() {
  local job_name="$1"
  if ! kubectl wait -n salesdaily --for=condition=complete \
    "job/$job_name" --timeout=11m; then
    kubectl get job "$job_name" -n salesdaily
    kubectl logs -n salesdaily "job/$job_name" || true
    echo "Job не завершился успешно. Остановиться; деплой пока не запускать." >&2
    return 1
  fi
  kubectl logs -n salesdaily "job/$job_name"
}

REGISTER_JOB="crm-register-$(date -u +%Y%m%d%H%M%S)-$RANDOM"
create_migration_job register-existing "$REGISTER_JOB"
wait_migration_job "$REGISTER_JOB"
```

Ожидаемый результат в логах:

```text
Registered 0000 and 0001 without executing SQL
```

Runner сверяет public-таблицы/колонки (типы, nullability, defaults/generated
expressions), ограничения, индексы, enum и три функции Search V2 с эталоном
после 0001. При несовпадении регистрация отказывает; проверка не пропускается.
Это проверка схемы, не бизнес-данных или разрешений ролей.
Порядок объектов и JSON-ключей при сравнении не учитывается: он может
различаться из-за локали БД. Все значения определений, включая порядок enum
в `enumsortorder`, проверяются без изменений.
После успешной проверки две записи добавляются одной транзакцией без
исполнения исторического SQL. Поздние миграции регистрация не помечает.

### 4. Проверить зарегистрированную историю отдельным read-only запуском runner

```bash
STATUS_JOB="crm-migration-status-$(date -u +%Y%m%d%H%M%S)-$RANDOM"
create_migration_job status "$STATUS_JOB"
wait_migration_job "$STATUS_JOB"
```

Для текущего набора из двух миграций ожидается:

```text
Applied 2; available 2
```

Режим `status` проверяет контрольные суммы истории и ничего в ней не меняет.
Если образ уже содержит последующие миграции, `available` будет больше двух;
они применятся при обычном деплое. Повторно запускать `register-existing`
после успеха не нужно: он намеренно откажет при непустом журнале.

### 5. Запустить обычный деплой того же релиза

```bash
# Защита от изменения tag между регистрацией и деплоем.
CURRENT_DIGEST=$(docker buildx imagetools inspect "$IMAGE_REF" \
  --format '{{json .Manifest.Digest}}' | tr -d '"')
[[ "$CURRENT_DIGEST" == "$IMAGE_DIGEST" ]]

printf 'Tag для поля tag в GitHub Actions: %s\n' "$RELEASE_TAG"
```

В браузере снова открыть **Actions → build-and-deploy → Run workflow**:

- выбрать ту же ветку с новым workflow;
- **build** — выключить;
- **deploy** — включить;
- **tag** — вставить точное значение `$RELEASE_TAG`, выведенное командой выше.

Запустить workflow и дождаться успешного завершения на странице запуска.
Затем проверить Deployment в терминале:

```bash
kubectl rollout status deployment/crm -n salesdaily --timeout=10m
kubectl get deployment crm -n salesdaily \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Автоматический Job проверит уже зарегистрированные `0000` и `0001`, пропустит
их SQL, применит только последующие миграции (если есть) и разрешит rollout.
Итоговый образ Deployment должен совпасть с `$MIGRATION_IMAGE`.
Регистрационные/проверочные Jobs удалит TTL-контроллер через 24 часа.

При отказе регистрации остановиться: посмотреть Job/логи по сохранённому имени,
сравнить каталог (режим `catalog` выводит метаданные, не строки данных) и выяснить
причину. Не изменять применённые SQL, журнал или эталон для маскировки drift.
Если Job завершился, но терминал потерял соединение, сначала выполнить шаг 4:
при `Applied 2` регистрация уже состоялась, повторять её не требуется.

## Новая БД

Создать пустую PostgreSQL 17 с UTF8 и подходящей локалью (`C.UTF-8` для
Cyrillic lower/ILIKE), выдать нужные права пользователю и предоставить DATABASE_URL.
`apply` создаёт расширения, исполняет 0000, затем 0001 и все следующие SQL,
записывает журнал. Регистрация здесь не нужна. Baseline содержит схему, а не
бизнес-данные: необходимые справочники/seed выполняются отдельно по инструкции
продукта. Не восстанавливать диагностический dump вместо manifest.

## Деплой и откат приложения

`dev.yml` требует успешный reusable `migrations.yml` с сервисом PostgreSQL 17.
Перед любым `kubectl apply -k` создаётся Job из **того же digest**, который затем
использует Deployment. SQL и runner находятся в образе, не подмешиваются из
checkout. Runtime pg с зависимостями копируется отдельно от Next tracing.
Даже при выборе старого tag текущий workflow остаётся управляющим кодом;
выбирать ветку с этим workflow, а tag задавать отдельно.

Job: один pod, `restartPolicy: Never`, `backoffLimit: 0`, deadline 600 секунд,
TTL 24 часа; в процессе SQL statement timeout 120 секунд (исторический 0001 —
60 секунд), lock timeout 5 секунд. Job не получает токен Kubernetes API,
использует только ключ DATABASE_URL существующего `crm-env`, образ скачивается
через `ghcr-pull`. Нет копирования DB-секретов в GitHub. Отдельные network policies
не обнаружены; проверить доступ Job к managed PG в кластере.

Deployer получает только `create/get` Jobs сверх текущих прав, без delete,
Secrets, exec и pods/log. Администратор заранее применяет обновлённый RBAC;
workflow не может выдать права себе. Kubernetes RBAC не ограничивает create Job
конкретным именем или Secret: право создавать workload фактически даёт возможность
использовать доступные ему секреты (у deployer уже есть create Deployment).
Если требуется более строгая изоляция, администратор вводит admission policy
на разрешённые образы, serviceAccount и secretKeyRef; это не сделано автоматически.

Ошибка Job, отсутствие прав, ошибка pull или timeout останавливают rollout.
Успешные ранние миграции остаются применёнными; SQL ошибочного файла откатывается
вместе с записью. После устранения причины повторить deploy: новое имя Job,
применённый префикс только проверяется. Не редактировать применённые файлы.
Workflow concurrency сериализует деплои dev, advisory lock защищает также от
ручного конкурентного запуска. При отмене workflow Job может ещё работать до
своего deadline: проверить Job перед повторным запуском.

Оператор диагностирует `kubectl get job <name> -n salesdaily`, describe/events,
и с собственными правами `kubectl logs job/<name> -n salesdaily`. Runner пишет
имена файлов и код PostgreSQL, скрывает SQL, URL и server error text, где могут
быть данные. SQLSTATE + имя неуспешного файла определяются по журналу/последней
успешной записи; детальную диагностику выполнять на отдельной тестовой копии.
Не публиковать dump или секреты в Actions logs.

Старый образ без runner или с более короткой/изменённой историей блокируется.
Для отката собрать **новый релиз** с прежним приложением и актуальными runner/SQL,
проверить совместимость и задеплоить новым tag. База автоматически не откатывается.
Не обходить gate выбором старой ветки workflow. После неудачного rollout база
может быть уже обновлена — поэтому expand/contract обязателен.

## Проверки и границы проверки

Локально реально выполнены интеграционные сценарии на временном PostgreSQL
16.15: новая БД, повтор, регистрация, отказ неполной схеме, параллельные запуски,
изменённый применённый SQL, rollback ошибочного SQL и отказ старому релизу.
Только в тестовой копии baseline исключён неподдерживаемый PG16
`SET transaction_timeout = 0`; исторический файл в репозитории неизменён.
Получение PostgreSQL 17 через Docker Hub и ECR не удалось из-за DNS окружения.
Это **не** подтверждение исполнения baseline на PG17: обязательный CI выполняет
исходные SQL на PG17 и сверяет каталог с сохранённым эталоном.

Локальный тест подменённого kubectl проверяет Failed/Complete и timeout и запрет перехода
к Apply при ошибке, плюс фактический порядок шагов workflow. Он не заменяет
кластерный тест. После одноразовой настройки проверить на отдельном namespace/
стенде: RBAC, pull digest, Secret reference, сеть/TLS/DDL права, успешный Job,
ошибочный SQL и deadline (Deployment image должен остаться прежним), логи/TTL,
откат старого tag. Кластер в ходе разработки не изменялся; Docker production
image и реальный GitHub Actions здесь не запускались.
