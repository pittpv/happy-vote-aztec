# 01 — Product Specification

## 1. Goal

Run a voting platform on **aztec.happyvote.xyz** with a minimal UX, Aztec programmable privacy, and optional ZKPassport personhood / eligibility.

Brand: **HappyVote on Aztec**. Related EVM HappyVote (Happy/Sad) stays a separate product.

## 2. Roles

| Role | Iteration 1 | Iteration 2 |
|------|-------------|-------------|
| **Voter** | Votes in published polls | Same |
| **HappyVote operator** | Publishes and closes polls (Iteration 1) | Same + moderate user polls |
| **Poll creator** | — | Any Aztec account (with limits) |
| **Observer** | Reads public tallies without a wallet | Same |

## 3. Poll templates

The platform is **not** limited to Happy/Sad.

| Template | Description | Example |
|----------|-------------|---------|
| `binary` | Two options | Happy / Sad |
| `single_choice` | One of N | Candidate A/B/C |
| `multi_choice` | Up to K of N | Later |
| `yes_no_abstain` | Yes / No / Abstain | Later |
| `approval` | Approve / Reject | Later |
| `ranked` | Ranking | After MVP |

Off-chain metadata (catalog + optional Vercel Blob): `title`, `description`, `locale`, `options[]` (label + optional description), `category`, `tags[]`, `cover`, `legal_notice`, optional `startsAt` / `endsAt`, ZKPassport requirement JSON.

On-chain integrity: `metadata_hash` (SHA-256 of canonical JSON, reduced to a Field).

## 4. Poll lifecycle

```
created → (optional wait until startsAt) → open → ended
```

- Voting is allowed while the poll exists, is not paused, is not cancelled, `vote_ended` is false, and the on-chain window is open (`starts_at` / `ends_at`; `0` = unset).
- Optional `starts_at` / `ends_at` (unix seconds on-chain). The catalog stores the same instants as ISO-8601 for display. Omit both → the poll stays open until `end_poll` or `cancel_poll`.
- A poll can be **published before `starts_at`**. Guests can read the question; Connect and Vote unlock automatically at start, then lock at `ends_at`. Direct `cast_vote_*` calls are rejected on-chain outside the window.
- After close, votes are rejected; tallies stay readable (unless sealed and still open).
- **Sealed tally:** while sealed **and** not closed (`vote_ended`, cancelled, or `now >= ends_at`), `get_tally` / `get_total_votes` return `0`; UI hides live results.

`end_poll` still closes immediately. Scheduled `ends_at` auto-closes without an extra admin tx. `cancel_poll` is allowed only while `total_votes == 0`.

## 5. Privacy

### 5.1 Poll policy (creator)

| Policy | Value | Meaning |
|--------|-------|---------|
| `private_only` | 0 | Private ballots only |
| `public_only` | 1 | Open ballots only |
| `voter_choice` | 2 | Voter picks private or open |

### 5.2 What the network sees

| Ballot | Who voted | Choice | Tallies |
|--------|-----------|--------|---------|
| **Private** | Address hidden (nullifier) | Increments public `tally[option]` unless sealed | Public after reveal / if not sealed |
| **Open** | Address + choice in `open_ballots` | Public | Same tally map |
| **Private + ZKPassport** | Personhood commitment claimed per poll | Same as private | Same |

Private mode **does not** hide the option from the live board: `option_id` is enqueued publicly. It hides the **Aztec address**.

## 6. Eligibility

| Level | On-chain `eligibility_mode` | Mechanism |
|-------|----------------------------|-----------|
| Open | 0 | Any Aztec account; one vote via `SingleUseClaim` |
| Personhood | 1 | ZKPassport `uniqueIdentifier` → `identity_commitment` |
| Gated | 2 | Personhood + age / nationality / sanctions / FaceMatch / Dashboard policy (predicates off-chain + server re-verify) |

Important polls should require at least personhood. Details live in catalog JSON; hash is on-chain.

## 7. Functional requirements

### Must-have (Iteration 1) — shipped

1. Catalog + poll cards (operator-published in Iteration 1).
2. Poll page: question, options, Vote CTA.
3. Connect Aztec account (embedded PXE / Browser session).
4. Private vote + public tally.
5. Optional open vote (`voter_choice`).
6. Double-vote prevention (`SingleUseClaim` + identity claims).
7. On-chain `end_poll` (contract admin).
8. Templates `binary` + `single_choice`.
9. Iteration 1: HappyVote operators publish polls on-chain.
10. Guest tallies without wallet (`GET /api/poll-state`).
11. Domain `aztec.happyvote.xyz`.
12. Docs + `AGENTS.md`.

### Should-have (1.5) — mostly shipped

13. ZKPassport gate + server re-verify + on-chain identity claim.
14. Sealed tallies.
15. Share `/p/:id`.
16. Sponsored FPC on Testnet.
17. Aztecscan links.
18. Legal pages in the footer.
19. SEO (titles, Open Graph, JSON-LD, sitemap, robots).
20. Shared catalog (`GET/POST /api/polls`).

Still manual: real-device ZKPassport E2E; turn off Dev Mode; participation receipt note.

### Iteration 2 — not started

Permissionless `create_poll`, anti-spam, moderation, discovery, more templates, creator profile.

## 8. Non-functional

| Area | Requirement |
|------|-------------|
| Safety | No silent `AztecAddress.ZERO` fallbacks |
| Privacy | No passport images or MRZ on HappyVote servers |
| Versions | Pin Aztec **5.1.0** |
| Legal | Disclaimer: tech platform, not an official election commission |
| Analytics | No third-party analytics counter on aztec.happyvote.xyz |
| UX | Mission on home; vote page 1080px; honest private-vote copy |

## 9. Anti-goals

- Do not clone EVM HappyVote UX (different account model).
- Do not store passport copies.
- Do not brand as a state election system.
- Do not call `nargo` / `bb` instead of `aztec` CLI.
- Do not mix Solidity contracts into Aztec.nr.

## 10. User journeys

### Sentiment (`/p/1`)

Home → Open polls → Happy/Sad → Connect → Private (default) or Open → prove → live results.

### Important poll (`/p/3`)

Open poll → ZKPassport QR → server re-verify → compact **Identity verified** → Connect → vote. Identity can vote once per poll across accounts.
