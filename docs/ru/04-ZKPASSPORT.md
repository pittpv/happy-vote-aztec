# 04 — ZKPassport

Официально: https://zkpassport.id/ · Docs: https://docs.zkpassport.id/  
Домен: `aztec.happyvote.xyz`

## 1. Зачем

Для важных опросов: человек vs бот; опционально возраст / гражданство / sanctions; **без** файлов паспорта на серверах HappyVote.

Поток: NFC ID → proof на телефоне → HappyVote получает результат предикатов + `uniqueIdentifier`.

## 2. Режимы

| Режим | Когда | Источник query |
|-------|-------|----------------|
| Self-served SDK | Правила на опрос | `@zkpassport/sdk` / `@zkpassport/ui` |
| Dashboard policy | Стабильный branded flow | [dashboard.zkpassport.id](https://dashboard.zkpassport.id) |

Production: SDK + QR, домен зарегистрирован, default policy `vote-identity-verification`.

## 3. Пример query

Personhood: `query={(q) => q.done()}`, `scope={poll:${pollId}}`.  
Gated: только нужные поля, например `q.gte("age", 18)`.

После `onResult` — `POST /api/zkpassport-verify`, затем hash `uniqueIdentifier`.

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
  Z->>UI: verified + uniqueIdentifier + proofs
  UI->>API: re-verify
  API-->>UI: OK
  UI->>UI: Свернуть gate — Identity verified
  U->>PXE: cast_vote_*(…, identity_commitment)
  PXE->>C: claim identity + tally
```

On-chain: `identity_commitment ≠ 0` для eligibility 1/2; `identity_claims` запрещает повтор.

## 5. Домен

Зарегистрировать `aztec.happyvote.xyz` в Dashboard. `uniqueIdentifier` привязан к домену. Не логировать proofs с PII.

## 6. Dev Mode

`VITE_ZKPASSPORT_DEV_MODE=true` для mock. Для реальных ID — **выключить**. Mock unlock только в DEV.

## 7. Ограничения

Несколько ID у одного человека → «один ID ↔ один голос». Нужно приложение ZKPassport.

## 8. Когда требовать

Fun / Happy/Sad — open. Community — personhood желателен. Политические — personhood обязателен. Пользовательские (итерация 2) — выбор создателя.

## 9. Off-chain JSON требований

В каталоге; SHA-256 → `metadata_hash`. `eligibility_mode`: `1` только personhood · `2` если есть age / nationality / sanctions / FaceMatch / `policyId`.

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

## 10. UI (2026-08-13)

QR — drop-in `@zkpassport/ui`, обёртка в стиле портала. После успеха QR снимается, баннер **Identity verified**, детали по клику.

## 11. Чеклист

- [x] SDK + UI, домен, gate, `eligibility_mode` + `metadata_hash`
- [x] `/api/zkpassport-verify`, identity claim
- [x] Стилизация + сворачивание
- [x] Noir: один identity, два аккаунта — fail
- [ ] E2E на устройстве; выключить Dev Mode
