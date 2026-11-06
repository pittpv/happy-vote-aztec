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

Адрес и выбор публичны (`open_ballots`). Тот же nullifier domain, что у private — нельзя проголосовать дважды, сменив режим. На дневных опросах общий domain — календарные сутки UTC.

### C. Voter choice

UI: **Private** (default) / **Open**. Оба инкрементят одну карту tally.

## 4. Sealed

On-chain (`sealed`): пока `sealed && !closed`, view возвращают `0`. UI скрывает live results и не ставит нули на кнопки вариантов. Закрыт = `vote_ended`, cancel или `now >= ends_at`. После закрытия читаются истинные tallies. Гостевой API в том же окне отдаёт нули; страница голоса их на бюллетене не рисует. Это **скрытие view**, не MPC-агрегат.

## 5. Eligibility без doxxing

ZKPassport доказывает personhood / возраст / гражданство / sanctions **на устройстве**. HappyVote получает `verified` + `uniqueIdentifier` + proofs.

1. Server re-verify (`POST /api/zkpassport-verify`) до разблокировки бюллетеня.
2. `identity_commitment` в `identity_claims` (Poseidon2 от poll, периода и commitment).
3. Nullifier аккаунта тоже действует — два аккаунта, один ID → второй голос отклоняется. На дневных опросах тот же identity может голосовать на следующие сутки UTC.

Open eligibility (`eligibility_mode = 0`) вяжет только **Aztec-аккаунт**. Browser session каждый Connect создаёт новый аккаунт, поэтому переподключение может дать ещё один бюллетень. То же возможно во внешнем кошельке, если создать ещё аккаунты. Это дешёвый Sybil; для fun-опросов допустимо и **не** гарантия уникальности человека. Personhood/gated добавляют identity claim выше.

Scope по умолчанию: **на опрос** (`poll:{id}`).

Форма даёт два режима автора. **Public address** записывает аккаунт, который отправил `create_user_poll`. **Private** записывает обязательство Poseidon2 (тег итога 205) вместо адреса. Секрет остаётся в заметке контракта `HiddenAuthorBook`. Только он может создать или завершить такой опрос. Закрытие и пополнение пула доказывают секрет приватным вызовом книги. На HappyVote опубликованный вызывающий — книга, не аккаунт. На этом пути комиссию платит контракт-спонсор, поэтому аккаунт не публикуется как плательщик создания или закрытия. Testnet использует канонический Sponsored FPC. Mainnet использует `AuthorFeeSponsor` из этого исходника. `HiddenAuthorBook` развёрнут в этом Testnet. `AuthorFeeSponsor` не развёрнут. Admin спонсора может остановить новые оплаты. Проверка паузы не принимает адрес автора. Fee Juice бриджится на спонсор и не переводится автору. Приватный бюллетень по-прежнему скрывает голосующего. ZKPassport к автору не привязан. Ключ подписи каталога — не ключ аккаунта. Листинг с приватным автором не содержит адрес аккаунта.

## 6. Чего не обещаем

Полную анонимность IP/тайминга. Privacy комиссий сверх Sponsored FPC. Статус официальной избирательной комиссии.

Счётчик посещений сайта — отдельный first-party агрегат (без cookies, IP не хранится, без poll ID). Страна считается на хосте из IP запроса, затем IP отбрасывается. К бюллетеням не привязан.

## 7. Обязательный копирайт

- **Private:** адрес скрыт; выбранный вариант всё равно обновляет публичный tally (если не sealed).
- **Open:** адрес и выбор публичны.
- **ZKPassport:** HappyVote не получает данные паспорта.
- **Автор:** режим public address хранит адрес создателя. Режим private хранит обязательство и не записывает адрес в опрос. Приватный бюллетень по-прежнему скрывает голосующего.

## 8. Чеклист

- [x] Nullifier на опрос (`SingleUseClaim`), опционально на сутки UTC
- [x] Private и open — один claim domain
- [x] Range `option_id` + reject truncation
- [x] Нет голоса после `end_poll` / `ends_at` / cancel
- [x] `metadata_hash` ↔ off-chain JSON
- [x] Server re-verify ZKPassport
- [x] On-chain identity claim
- [x] Sealed tallies
- [x] Агрегаты посещений отделены от бюллетеней (нет cookies, IP не хранится, нет poll id)
- [ ] E2E на реальном устройстве
