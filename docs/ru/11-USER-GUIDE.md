# 11 — Гайд пользователя (Testnet)

Production: **https://aztec.happyvote.xyz**  
UI: [12-UI-UX.md](./12-UI-UX.md)

## Главная

1. Откройте https://aztec.happyvote.xyz.
2. При желании прочитайте миссию и pillars.
3. В **Open polls** найдите опрос и откройте карточку.

В подвале — ссылки автора (X, LinkedIn, GitHub) и юридические страницы.

## Без кошелька

- Каталог и страница опроса
- **Live results** (скрыты, пока опрос sealed и ещё открыт)
- Шаринг `/p/1`, `/p/2`, `/p/3`
- Контракт на [Aztecscan](https://testnet.aztecscan.xyz)

## Голос (private или open)

1. Откройте опрос, например https://aztec.happyvote.xyz/p/1.
2. Чипы: **Ready/Verify → Connect → Vote**.
3. Если нужен ZKPassport — QR на десктопе, приложение на телефоне. После успеха блок сжимается в **Identity verified**.
4. **Connect Aztec wallet**. Предпочтительно **Browser session** (in-page PXE). Первый prove может занять несколько минут.
5. В **Your ballot** выберите вариант. В **Ballot privacy** — **Private** (по умолчанию) или **Open**.
6. Отправьте голос. Статус рядом с CTA; **Open tx**, когда появится.
7. **Fees on testnet** — только при ошибке комиссии: https://aztec-faucet.nethermind.io
8. **How to vote** — короткий чеклист.

На широком экране **Live results** справа; на мобильном — ниже.

## Правила

- Один голос на Aztec-аккаунт на опрос (`SingleUseClaim`).
- Private скрывает **адрес**; выбранный вариант всё равно двигает публичный tally (если не sealed).
- Open публикует адрес и выбор.
- Важные опросы могут требовать один ZKPassport identity на опрос.
- Гостевые tallies — `/api/poll-state`.

HappyVote не получает данные паспорта. Подробнее: [04-ZKPASSPORT.md](./04-ZKPASSPORT.md).
