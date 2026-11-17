# 04 — ZKPassport

Официально: https://zkpassport.id/ · Docs: https://docs.zkpassport.id/  
Домен: `aztec.happyvote.xyz`

## 1. Зачем

Для важных опросов: человек vs бот; опционально возраст / гражданство / sanctions; **без** файлов паспорта на серверах HappyVote.

Поток: NFC ID → proof на телефоне → HappyVote получает результат предикатов + `uniqueIdentifier`.

Опросы с open-eligibility **не** используют ZKPassport. Там один голос на Aztec-аккаунт, поэтому новая Browser session может дать ещё один бюллетень.

## 2. Режимы

| Режим | Когда | Источник query |
|-------|-------|----------------|
| Self-served SDK | Правила на опрос | `@zkpassport/sdk` / `@zkpassport/ui` |
| Dashboard policy | Стабильный branded flow | [dashboard.zkpassport.id](https://dashboard.zkpassport.id) |

Production: SDK + QR, домен зарегистрирован, default policy `vote-identity-verification`.

Если в каталоге задан `policyId`, query в виджете только `.policy(id)`, а scope запроса — этот policy id. Self-served опросы используют `poll:{id}`. Предикаты из JSON каталога вместе с policy не отправляются. Сервер вызывает `verify()` с тем же scope, а для policy берёт query из Dashboard, а не query из браузера. Фильтр стран на All polls всё равно нужен: при пустых `countries` / `nationalityIn` / `issuedBy` UI читает публичный Dashboard-проект `aztec.happyvote.xyz` и берёт `nationality` и `issuing_country` (`eq` / `in`). Виджет использует актуальный каталожный `policyId`; on-chain `metadata_hash` задаётся в `create_poll` и не меняется, если id в каталоге позже заменят.

### Настройки создателя

Опрос со страницы **Create** не задаёт Dashboard policy id. Personhood обязателен. Необязательные проверки входят в подписанное объявление:

| Проверка | Граница |
|----------|---------|
| Возраст | Целое 1–99. Минимум — `age.gte`, максимум — `age.lte`. |
| Дата рождения и срок документа | Календарный день `YYYY-MM-DD`, в запросе это тот же день UTC |
| Национальность и страна выдачи | ISO alpha-3, включить (`in`) или исключить (`out`). Один код не может быть и там, и там |
| Тип документа | Один: паспорт, национальное ID или вид на жительство |
| Sanctions, FaceMatch | Список sanctions или FaceMatch `strict` |

Опрос с Dashboard policy id доказывает эту политику. Строки возраста, страны и документа в объявлении не становятся запросом. Scope — этот policy id.

### Проверка голосующего

QR-запрос строится из объявления. После proof на телефоне `onSuccess` отправляет proofs, результат query, исходный query и scope на `/api/zkpassport-verify`. Для self-served опроса сервер принимает query, только если в нём есть каждое сохранённое правило. Более узкий query принимается. Пропущенная или более широкая проверка отклоняется. `verify()` сверяет proofs с этим query и scope. Бюллетень использует `uniqueIdentifier` из этого ответа.

Для опроса с policy сервер загружает текущий query Dashboard по policy id из каталога и передаёт его в `verify()` с тем же scope. Query из браузера не проверяется.

## 3. Пример query

Personhood: `query={(q) => q.done()}`, `scope={poll:${pollId}}`.  
Gated: только нужные поля, например `q.gte("age", 18)`.

После `onSuccess` — `POST /api/zkpassport-verify` (`proofs`, `result`, исходный query и scope). Сервер вызывает `verify()` и возвращает `uniqueIdentifier`.

## 4. Связка с голосом

```mermaid
sequenceDiagram
  participant U as Пользователь
  participant UI as HappyVote Web
  participant Z as ZKPassport
  participant API as Verify API
  participant PXE as PXE
  participant C as HappyVote

  U->>UI: Важный опрос
  UI->>Z: query + scope poll:id
  U->>Z: NFC + prove
  Z->>UI: proofs + результат query
  UI->>API: re-verify
  API-->>UI: OK + uniqueIdentifier
  UI->>UI: Свернуть gate — Identity verified
  U->>PXE: cast_vote_*_attested(identity, expiry, signature)
  PXE->>C: claim identity + tally
```

On-chain: `identity_commitment ≠ 0` для eligibility 1/2; `identity_claims` запрещает повтор. Голос использует поле identity из свидетельства. Подпись покрывает опрос, identity, период и срок. Она действует около 15 минут. Поздний голос требует нового скана.

## 5. Домен

Зарегистрировать `aztec.happyvote.xyz` в Dashboard. `uniqueIdentifier` привязан к домену и scope (`poll:{id}` или policy id). Смена домена или scope меняет id. Не логировать proofs с PII.

## 6. Proofs

Server re-verify должен быть включён. Mock-паспорта — только для локальной разработки; на production нужны реальные ID.

## 7. Ограничения

Несколько ID у одного человека → «один ID ↔ один голос». FaceMatch на iOS использует Apple App Attest внутри приложения ZKPassport; ошибка DeviceCheck / key attestation — на стороне приложения и Apple, не HappyVote. Нужно приложение ZKPassport.

## 8. Когда требовать

Fun / Happy/Sad — open. Community — personhood желателен. Политические — personhood обязателен. Пользовательские (итерация 2) — выбор создателя.

## 9. Off-chain JSON требований

В каталоге. При `create_poll` SHA-256 канонического JSON сводится в Field → on-chain `metadata_hash` (в браузере digest сначала в Node `Buffer`, затем `fromBufferReduce`). Хеш — `PublicImmutable`. Поздняя смена каталожного `policyId` меняет query виджета, но не это on-chain поле. `eligibility_mode`: `1` только personhood · `2` если есть возраст / дата рождения / национальность / документ / sanctions / FaceMatch / `policyId`. Возраст вне 1–99 отклоняется до публикации опроса.

```json
{
  "personhood": true,
  "minAge": 18,
  "nationalityIn": ["USA", "DEU"],
  "nationalityOut": [],
  "sanctions": false,
  "facematchStrict": false,
  "policyId": null,
  "purpose": "Prove eligibility to vote on HappyVote on Aztec"
}
```

## 10. UI (2026-09-18)

QR — drop-in `@zkpassport/ui`, обёртка в стиле портала. `--zkp-bg` на карточке должен быть **непрозрачным**: виджет красит **Try again** этим цветом. Прозрачный `--zkp-bg` прятал подпись после неудачного скана. После успеха QR снимается, баннер **Identity verified**, детали по клику (включая предикаты Dashboard policy).

## 11. Чеклист

- [x] SDK + UI, домен, gate, `eligibility_mode` + `metadata_hash`
- [x] `/api/zkpassport-verify`, identity claim
- [x] Стилизация + сворачивание
- [x] Фильтр стран каталога из Dashboard policy
- [x] Noir: один identity, два аккаунта — fail
- [ ] E2E на устройстве
