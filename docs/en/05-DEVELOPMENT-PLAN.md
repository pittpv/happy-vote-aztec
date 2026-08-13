# 05 — Development Plan

Toolchain: **Aztec 5.1.0**.  
AI / CLI: https://docs.aztec.network/developers/ai_tooling

## Phase 0 — Foundation

**Status: done (2026-08-11)**

WSL2 Ubuntu, Node 24.12, Aztec CLI 5.1.0, docs, `AGENTS.md`, bootstrap from aztec-starter.

**Exit:** `aztec compile` and `aztec test` green.

## Phase 1 — Core voting contracts

**Status: done** — Noir **24/24**

- Multi-poll `HappyVote` storage
- `cast_vote_private` / `cast_vote_open` + shared `SingleUseClaim`
- Public tally update + open ballots
- `create_poll` / `end_poll` (contract admin)
- Truncation checks on `option_id`

## Phase 2 — Frontend MVP

**Status: done** — https://aztec.happyvote.xyz

- Vite React app in `web/`
- Connect Aztec account (embedded wallet / Browser session)
- Poll page with privacy toggle
- Guest tallies via `/api/poll-state`
- Fraunces / Sora, teal / amber
- Responsive vote layout (1080px)

## Phase 3 — Testnet

**Status: deployed 2026-08-12**, current contract 2026-08-13  
Addresses: [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md)

Remaining: manual private/open vote from an external account on production.

## Phase 4 — ZKPassport

**Status: live**

SDK + QR gate + server re-verify + on-chain `identity_commitment`. Domain `aztec.happyvote.xyz`. Remaining: real-device E2E.

## Phase 5 — Product hardening

**Status: hardening for Iteration 1 (2026-08-13)**

| # | Task | Status |
|---|------|--------|
| 5.1 | Sealed tally | Done — on-chain `sealed` + UI hide until `end_poll` |
| 5.2 | Metadata + catalog | Done — `GET /api/polls` |
| 5.3 | Legal pages | Done — Terms, Privacy, Data Safety, Cookies, GDPR |
| 5.4 | Security review | Done — option_id truncation; XSS/boot; ZKPassport mock gated to DEV |
| 5.5 | Production frontend | Done — APIs, SEO |
| 5.6 | Mobile vote CTA + option bars | Done |
| 5.7 | ZKPassport portal chrome | Done — collapse after success |

## Phase 6 — Alpha mainnet

Pin Alpha 5.1.0 (or current stable), Fee Juice / FPC, redeploy, public launch.

## Phase 7 — Iteration 2: user-created polls

Permissionless `create_poll` with limits, anti-spam, moderation, discovery, extra templates.

## Backlog priority

**P0 shipped:** private + public modes, nullifiers, operator-created polls, Happy/Sad + single_choice, public tallies, Aztec tooling, minimal UX.

**P1 shipped / in progress:** ZKPassport, share links, read-only guests, sponsored fees, metadata hash, explorer links, disclaimers, legal, SEO.

**P2 later:** user-created polls, indexer, i18n RU/EN in the UI, export, embed.

**P3 research:** ranked choice, delegation, L1 attestation, private fee relays, salted ZKPassport IDs.

## Definition of Done — Iteration 1

- [x] Contracts on Testnet, addresses documented
- [x] Frontend on aztec.happyvote.xyz
- [x] Happy/Sad + multi-option + ZKPassport demo polls
- [x] Private and public modes (`voter_choice`)
- [x] Double-vote impossible (Noir + `SingleUseClaim`)
- [x] ZKPassport gate + server re-verify + identity claim
- [x] `aztec compile` / `aztec test` green (24/24)
- [x] User guide for connect + vote
- [ ] Real-device ZKPassport E2E
