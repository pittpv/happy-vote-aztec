# HappyVote on Aztec — Документация

**Продукт:** платформа голосований на Aztec Network  
**URL:** https://aztec.happyvote.xyz  
**Версия сети / SDK:** Aztec `5.1.0` (Testnet → Alpha)  
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
| [09-HOSTING.md](./09-HOSTING.md) | Домен, публичные API, SEO |
| [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md) | Адреса на Testnet 5.1.0 |
| [11-USER-GUIDE.md](./11-USER-GUIDE.md) | Как подключить аккаунт и проголосовать |
| [12-UI-UX.md](./12-UI-UX.md) | Landing, страница голосования, ZKPassport, SEO |
| [13-LEGAL.md](./13-LEGAL.md) | Terms, Privacy, Cookies, Data Safety, GDPR |
| [../../AGENTS.md](../../AGENTS.md) | Правила для AI/разработки ([AI Tooling](https://docs.aztec.network/developers/ai_tooling)) |

## Краткое видение

Минималистичная платформа для голосований **любой тематики**: от Happy/Sad до выборов и референдумов.

1. **Programmable privacy** Aztec — голос может скрывать избирателя при публичном (или sealed) табло.
2. **Выбор голосующего** — закрытый (по умолчанию) или открытый голос, если политика опроса это разрешает.
3. **ZKPassport** — personhood, возраст, гражданство без передачи паспортных данных платформе.
4. **Две итерации создания:** сначала операторы HappyVote; затем — пользователи.

## Принципы продукта

- **Минимализм UI** — вопрос, варианты, одно CTA.
- **Privacy by design** — приватный голос по умолчанию; публичность только явно.
- **Честный копирайт** — private скрывает **адрес**, а не live-счётчик варианта.
- **Доказуемость** — итоги on-chain; правила опроса в контракте.
- **Совместимость с Aztec** — только `aztec` CLI, Poseidon2, версия SDK = версия сети.
- **Без custody identity** — данные документа не покидают устройство.

## Статус (2026-08-13)

Контракт `HappyVote` на **Aztec Testnet 5.1.0**: [`0x0c5dbc2f68bf8e25f8ddc5c547d0ccf010ad4ed0262c6c1e09dc35cb0cdb3ac0`](https://testnet.aztecscan.xyz/address/0x0c5dbc2f68bf8e25f8ddc5c547d0ccf010ad4ed0262c6c1e09dc35cb0cdb3ac0). Опросы `/p/1` Happy/Sad, `/p/2` single-choice, `/p/3` ZKPassport personhood. Noir-тесты **24/24**. Фронтенд: https://aztec.happyvote.xyz.

## Источники истины

- Aztec docs: https://docs.aztec.network/
- Networks: https://docs.aztec.network/networks
- ZKPassport: https://zkpassport.id/ · https://docs.zkpassport.id/
- Starter: https://github.com/AztecProtocol/aztec-starter
