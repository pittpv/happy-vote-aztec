# 05 — План разработки

Toolchain: **Aztec 5.1.0**.  
AI / CLI: https://docs.aztec.network/developers/ai_tooling

## Phase 0 — Foundation

**Готово (2026-08-11)** — WSL2, Node 24.12, Aztec CLI 5.1.0, docs, каркас.

## Phase 1 — Контракты

**Готово** — Noir **24/24**. Multi-poll `HappyVote`, private/open + `SingleUseClaim`, `create_poll` / `end_poll` (контрактный admin), truncation check.

## Phase 2 — Frontend MVP

**Готово** — https://aztec.happyvote.xyz. Vite React, Connect, guest tallies, сетка 1080px.

## Phase 3 — Testnet

**Задеплоено 2026-08-12**, актуальный контракт 2026-08-13. Адреса: [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md). Осталось: ручной private/open vote с внешнего аккаунта.

## Phase 4 — ZKPassport

**Live** — SDK + QR + server re-verify + `identity_commitment`. Осталось: E2E на устройстве.

## Phase 5 — Hardening

| # | Задача | Статус |
|---|--------|--------|
| 5.1 | Sealed tally | Готово |
| 5.2 | Метаданные + каталог | Готово — `GET /api/polls` |
| 5.3 | Юридические страницы | Готово |
| 5.4 | Security review | Готово |
| 5.5 | Production + SEO | Готово |
| 5.6 | Mobile CTA + option bars | Готово |
| 5.7 | ZKPassport в стиле портала | Готово |

## Phase 6 — Alpha

Pin версии, Fee Juice / FPC, redeploy.

## Phase 7 — Пользовательские опросы

Permissionless `create_poll`, антиспам, модерация, discovery.

## DoD итерации 1

Контракты на Testnet, UI на домене, три демо-опроса, private/open, double-vote невозможен, ZKPassport gate, тесты 24/24, гайд. Не закрыто: E2E на устройстве.
