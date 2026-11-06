# HappyVote on Aztec — Документация

**Продукт:** платформа голосований на Aztec Network  
**URL:** https://aztec.happyvote.xyz  
**Версия сети / SDK:** Aztec **6.0.0**, стабильный образ на Testnet и Mainnet. Этот сайт голосует в Testnet.  
**Публичный репозиторий:** https://github.com/pittpv/happy-vote-aztec  
**Языки:** [English](../en/README.md) · [Русский](./README.md)

## Содержание

| Документ | Назначение |
|----------|------------|
| [01-PRODUCT-SPEC.md](./01-PRODUCT-SPEC.md) | Продуктовые требования, роли, типы голосований, режимы приватности |
| [02-ARCHITECTURE.md](./02-ARCHITECTURE.md) | Архитектура on-chain / off-chain, контракт, API (схемы) |
| [03-PRIVACY-MODEL.md](./03-PRIVACY-MODEL.md) | Модель приватности: private / public / sealed |
| [04-ZKPASSPORT.md](./04-ZKPASSPORT.md) | Identity verification через ZKPassport |
| [05-DEVELOPMENT-PLAN.md](./05-DEVELOPMENT-PLAN.md) | План разработки по итерациям |
| [09-HOSTING.md](./09-HOSTING.md) | DNS / хостинг / CSP / API |
| [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md) | Адреса на Testnet 6.0.0 |
| [11-USER-GUIDE.md](./11-USER-GUIDE.md) | Как подключить аккаунт и проголосовать |
| [12-UI-UX.md](./12-UI-UX.md) | Landing, страница голосования, ZKPassport, SEO |
| [13-LEGAL.md](./13-LEGAL.md) | Terms, Privacy, Cookies, Data Safety, GDPR |
| [../../AGENTS.md](../../../AGENTS.md) | Правила для AI/разработки ([AI Tooling](https://docs.aztec.network/developers/ai_tooling)) |

## Краткое видение

Минималистичная платформа для голосований **любой тематики**: от Happy/Sad до выборов и референдумов.

1. **Programmable privacy** Aztec — голос может скрывать избирателя при публичном (или sealed) табло.
2. **Выбор голосующего** — закрытый (по умолчанию) или открытый голос, если политика опроса это разрешает.
3. **ZKPassport** — personhood, возраст, гражданство без передачи паспортных данных платформе.
4. **Два пути создания:** HappyVote публикует опросы главной. Подключённый аккаунт публикует опрос с одним вариантом на `/create` тем же диалогом Connect, что и голосование. Автор может быть публичным адресом или приватным. Приватное создание идёт через развёрнутый `HiddenAuthorBook`. В Testnet создание и досрочное завершение приватного автора платит Sponsored FPC. В Mainnet плательщик — контракт AuthorFeeSponsor из этого исходника. AuthorFeeSponsor не развёрнут, поэтому на сайте Mainnet Private выключен, пока этот адрес не задан. **Your polls** показывает публичные опросы этого адреса и приватные опросы этого кошелька и может завершить опрос досрочно. Публикация — один sponsored `send()`, той же формы, что и бюллетень. После смены разрешения отключите кошелёк и подключите снова.

## Принципы продукта

- **Минимализм UI** — вопрос, варианты, одно CTA.
- **Privacy by design** — приватный голос по умолчанию; публичность только явно.
- **Честный копирайт** — private скрывает **адрес**, а не live-счётчик варианта.
- **Доказуемость** — итоги on-chain; правила опроса в контракте.
- **Совместимость с Aztec** — только `aztec` CLI, Poseidon2, версия SDK = версия сети.
- **Без custody identity** — данные документа не покидают устройство.

## Статус (2026-11-06)

`HappyVote` на **Aztec Testnet 6.0.0**: [`0x12b946b72a45a75719bd4af4f1697d99e02acf45d79876b8cbce1df115783fb0`](https://testnet.aztecscan.xyz/address/0x12b946b72a45a75719bd4af4f1697d99e02acf45d79876b8cbce1df115783fb0). Приватный автор использует [`HiddenAuthorBook`](https://testnet.aztecscan.xyz/address/0x14142f160aad70469e2702ad9d52d8c9cee5f9724ed58983329ce9c7e10c4bb8) `0x14142f160aad70469e2702ad9d52d8c9cee5f9724ed58983329ce9c7e10c4bb8`. Тот же стабильный образ **6.0.0** стоит на Aztec Mainnet. Этот сайт голосует в Testnet. Стабильный 6.0.0 — новый genesis: транзакции Testnet 6.0.0-rc.3 на этой сети недействительны. Опросы `/p/1` Happy/Sad, `/p/2` single-choice, `/p/3` ZKPassport personhood, `/p/4` sealed tallies начинаются на этом адресе. Тесты Noir: HappyVote 66, HiddenAuthorBook 14, AuthorFeeSponsor 6. Create записывает опрос пользователя в этот контракт. В **Earlier networks** остаются более ранний контракт Testnet 6.0.0 [`0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14`](https://testnet.aztecscan.xyz/address/0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14) и Testnet 5.1.0 [`0x2e10858cf6750c003489a62f570535966fb940bb10d18a0c146a36cac64713b6`](https://testnet.aztecscan.xyz/address/0x2e10858cf6750c003489a62f570535966fb940bb10d18a0c146a36cac64713b6). Контракта от 4 ноября `0x08cc6d5b022900717c01af9b2800a83177aeab263cfd920416b33b56f6bc5881` в этом архиве нет, и это развёртывание не архивирует `0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1`. Эти строки не ведут на `/p/:id`. Фронтенд: https://aztec.happyvote.xyz.

## Источники истины

- Aztec docs: https://docs.aztec.network/
- Networks: https://docs.aztec.network/networks
- ZKPassport: https://zkpassport.id/ · https://docs.zkpassport.id/
- Starter: https://github.com/AztecProtocol/aztec-starter
