# 03 — Модель приватности

## 1. Зачем отдельная модель

На EVM HappyVote голос публичен (адрес ↔ выбор). Aztec позволяет разделить валидность бюллетеня, личность (адрес), содержимое vs live-табло и видимость итогов во времени.

## 2. Оси

```
Identity disclosure     Ballot disclosure     Tally visibility
─────────────────       ─────────────────     ────────────────
anonymous               private               live
pseudonymous            public                sealed until end
verified personhood     (вариант всё равно    final only
(public address)         двигает live tally)
```

Комбинации = политика опроса + выбор голосующего + флаг sealed.

## 3. Режимы

### A. Private (по умолчанию)

Адрес скрыт. Выбор, привязанный к адресу, не публикуется. `option_id` в public enqueue **публичен**, если опрос не sealed. Доказательство «имел право + первый голос» — публичный ZK proof.

Механика: `cast_vote_private` → `SingleUseClaim` → `add_to_tally_public`.

Честный UX: live-табло показывает **какой вариант сдвинулся**, не **кто**. Sealed скрывает счётчики до `end_poll`.

### B. Open

Адрес и выбор публичны (`open_ballots`). Тот же nullifier domain, что у private — нельзя проголосовать дважды, сменив режим.

### C. Voter choice

UI: **Private** (default) / **Open**. Оба инкрементят одну карту tally.

## 4. Sealed

On-chain (`sealed`): пока `sealed && !closed`, view возвращают `0`, UI скрывает результаты. Закрыт = `vote_ended`, cancel или `now >= ends_at`. После закрытия читаются истинные tallies. Гостевой API в том же окне отдаёт нули. Это **скрытие view**, не MPC-агрегат.

## 5. Eligibility без doxxing

ZKPassport доказывает personhood / возраст / гражданство / sanctions **на устройстве**. HappyVote получает `verified` + `uniqueIdentifier` + proofs.

1. Server re-verify (`POST /api/zkpassport-verify`) до разблокировки бюллетеня.
2. `identity_commitment` в `identity_claims[poll][commitment]`.
3. Nullifier аккаунта тоже действует — два аккаунта, один ID → второй голос отклоняется.

Scope по умолчанию: **на опрос** (`poll:{id}`).

## 6. Чего не обещаем

Полную анонимность IP/тайминга. Privacy комиссий сверх Sponsored FPC. Статус официальной избирательной комиссии.

## 7. Обязательный копирайт

- **Private:** адрес скрыт; выбранный вариант всё равно обновляет публичный tally (если не sealed).
- **Open:** адрес и выбор публичны.
- **ZKPassport:** HappyVote не получает данные паспорта.

## 8. Чеклист

- [x] Nullifier на опрос (`SingleUseClaim`)
- [x] Private и open — один claim domain
- [x] Range `option_id` + reject truncation
- [x] Нет голоса после `end_poll` / `ends_at` / cancel
- [x] `metadata_hash` ↔ off-chain JSON
- [x] Server re-verify ZKPassport
- [x] On-chain identity claim
- [x] Sealed tallies
- [ ] E2E на реальном устройстве
