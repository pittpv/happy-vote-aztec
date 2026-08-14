# 03 — Privacy Model

## 1. Why a separate model

On EVM HappyVote, a vote is public (address ↔ choice). Aztec lets the product split:

- validity of the ballot;
- voter identity (address);
- ballot content vs live board;
- tally visibility over time.

## 2. Privacy axes

```
Identity disclosure     Ballot disclosure     Tally visibility
─────────────────       ─────────────────     ────────────────
anonymous               private               live
pseudonymous            public                sealed until end
verified personhood     (option still         final only
(public address)         updates live tally)
```

Combinations = poll policy + voter choice + sealed flag.

## 3. Modes

### A. Private (default)

| Element | Visibility |
|---------|------------|
| Voter address | Hidden |
| Choice bound to that address | Not published |
| `option_id` in enqueued public tally | **Public** unless sealed |
| Proof of “eligible + first vote” | Public ZK proof |
| `tally[option]` | Public +1 without address |

Mechanics: `cast_vote_private` → `SingleUseClaim` → `add_to_tally_public(option_id, identity_commitment)`.

Honest UX: live boards reveal **which option moved**, not **who** moved it. Sealed polls hide counts until the poll is **closed** (`end_poll`, `cancel_poll`, or `now >= ends_at`).

### B. Open

| Element | Visibility |
|---------|------------|
| Address | Public (`open_ballots`) |
| Option | Public |
| Tally | Public (unless sealed) |

Same nullifier domain as private — you cannot vote twice by switching modes.

### C. Voter choice

UI: **Private** (default) / **Open**. Both increment the same tally map.

## 4. Sealed polls

Implemented on-chain (`sealed` storage):

- While `sealed && !closed`: views return `0`; UI hides live results. Closed = `vote_ended` or cancelled or scheduled `ends_at`.
- After close: true tallies are readable.
- Guest API zeros tallies in the same window.

This is **view hiding**, not encrypted aggregate MPC.

## 5. Eligibility without doxxing

ZKPassport proves personhood / age / nationality / sanctions **on device**. HappyVote receives `verified` + `uniqueIdentifier` + proofs.

Binding:

1. Server re-verify (`POST /api/zkpassport-verify`) before unlocking the ballot.
2. `identity_commitment` from `uniqueIdentifier` claimed in `identity_claims[poll][commitment]`.
3. Account nullifier still applies — two accounts, one ID → second vote fails.

Default ZKPassport scope: **per poll** (`poll:{id}`).

| Strategy | Scope | Meaning |
|----------|-------|---------|
| Per poll | `poll:{id}` | One vote per poll (default) |
| Per platform | `happyvote-aztec` | Rare |
| Per election family | `election:…` | One vote in a group |

## 6. What we do not promise

1. Full IP / timing anonymity (no Tor/relayer in MVP).
2. Fee-metadata privacy beyond Sponsored FPC patterns.
3. Official election-commission status.

## 7. Required UI copy

- **Private:** address hidden; the chosen option still updates the public tally (unless sealed).
- **Open:** address and choice are public.
- **ZKPassport:** HappyVote does not receive passport document data.

## 8. Privacy checklist

- [x] Nullifier per poll (`SingleUseClaim`)
- [x] Private and open share one claim domain
- [x] `option_id` range + reject Field→u32 truncation
- [x] No vote after `end_poll` / `ends_at` / cancel
- [x] No zero-address fallbacks on required client paths
- [x] `metadata_hash` ↔ off-chain JSON
- [x] Server re-verify ZKPassport for gated polls
- [x] On-chain identity claim
- [x] Sealed tallies
- [ ] Real-device ZKPassport E2E; disable Dev Mode
