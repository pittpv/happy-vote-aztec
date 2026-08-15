# 05 — План разработки

Toolchain: **Aztec 5.1.0**.  
AI / CLI: https://docs.aztec.network/developers/ai_tooling

## Phase 0 — Foundation

**Готово (2026-08-11)** — Node 24.12, Aztec CLI 5.1.0, docs, каркас.

## Phase 1 — Контракты

**Готово** — Noir тесты + local smoke. Multi-poll `HappyVote`, private/open + `SingleUseClaim`, `create_poll` / `end_poll` / `cancel_poll` / pause / transfer, on-chain окно, truncation check.

## Phase 2 — Frontend MVP

**Готово** — https://aztec.happyvote.xyz. Vite React, Connect, guest tallies, сетка 1080px.

## Phase 3 — Testnet

**Задеплоено 2026-08-12**, актуальный контракт 2026-08-14. Адреса: [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md). Осталось: ручной private/open vote с внешнего аккаунта.

## Phase 4 — ZKPassport

**Live** — SDK + QR + server re-verify + `identity_commitment`. Осталось: E2E на устройстве.

## Phase 5 — Hardening

| # | Задача | Статус |
|---|--------|--------|
| 5.1 | Sealed tally | Готово |
| 5.2 | Метаданные + каталог | Готово — `/api/polls` |
| 5.3 | Юридические страницы | Готово |
| 5.4 | Security review | Готово |
| 5.5 | Client errors | Готово |
| 5.6 | Performance | Частично |
| 5.7 | Production + SEO | Готово |
| 5.8 | Mobile CTA + option bars | Готово |
| 5.9 | ZKPassport в стиле портала | Готово |
| 5.10 | Окно голосования | Готово — on-chain `starts_at` / `ends_at` + ISO в каталоге + обратный отсчёт |
| 5.11 | Hardening контракта | Готово — PublicImmutable конфиг, проверки до nullifier, pause, cancel, transfer_admin, next_poll_id |
| 5.12 | Свои агрегаты посещений | Готово — cookieless `POST /api/site-stats`, чтение оператором |

## Phase 6 — Alpha

Pin версии, Fee Juice / FPC, redeploy, runbook.

## Phase 7 — Пользовательские опросы

Permissionless `create_poll`, антиспам, модерация, discovery.

## DoD итерации 1

Контракты на Testnet, UI на домене, три демо-опроса, private/open, double-vote невозможен (опционально раз в сутки UTC), ZKPassport gate, тесты, гайд. Не закрыто: E2E на устройстве.
