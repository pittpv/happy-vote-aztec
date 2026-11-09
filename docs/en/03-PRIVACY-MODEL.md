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
pseudonymous            public                private note, then published
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

Honest UX: on an unsealed poll, live boards reveal **which option moved**, not **who** moved it. A sealed poll does not put the option in public state.

### B. Open

| Element | Visibility |
|---------|------------|
| Address | Public (`open_ballots`) |
| Option | Public |
| Tally | Public (unless sealed) |

Same nullifier domain as private — you cannot vote twice by switching modes. On daily polls the shared domain is per UTC day.

### C. Voter choice

UI: **Private** (default) / **Open**. Both increment the same tally map.

## 4. Sealed polls

A sealed ballot does not call `cast_vote_private`. It calls `SealedTallyBook.cast`. The option is a private note owned by the poll's tally recipient. The public call records that a ballot was accepted and does not receive the option.

- `get_tally` and `get_total_votes` stay at zero until `sealed_ballots == sealed_counted`. Closing the poll does not publish the options.
- After close, the tally recipient publishes notes in pages of at most 16. Views stay at zero until every accepted ballot is included.
- Guests can read the accepted-ballot counter. They cannot read the notes. The recipient can read the notes before publishing them.
- A hidden-author sealed poll uses the contract admin as the recipient, so that admin can read those notes.
- An open ballot cannot be sealed. A sealed poll does not offer an open ballot.

This is a private note held by a known recipient, not an encrypted tally that nobody can read.

## 5. Eligibility without doxxing

ZKPassport proves personhood / age / nationality / sanctions **on device**. HappyVote receives `verified` + `uniqueIdentifier` + proofs.

Binding:

1. Server re-verify (`POST /api/zkpassport-verify`) checks the proof for `aztec.happyvote.xyz` and the poll's query.
2. The server signs a short-lived attestation over the poll, the identity field, the vote period, and an expiry. The private circuit checks that secp256k1 signature. The public function checks the expiry window and that the public key matches the key stored on the contract.
3. `identity_claims` stores Poseidon2 of poll, vote period, and that identity. Two accounts with one identity cannot both vote. Daily polls can use the same identity on the next UTC day, with a new signature for that day.
4. The account nullifier still applies. Open polls do not take an identity or an attestation.

Open eligibility (`eligibility_mode = 0`) only binds the **Aztec account**. Browser session mints a new account on every Connect, so reconnecting can add another ballot. An external wallet can do the same if the user creates more accounts. That is a cheap Sybil vector; it is acceptable for fun polls and is **not** a uniqueness guarantee. Personhood/gated polls add the identity claim above.

Default ZKPassport scope: **per poll** (`poll:{id}`).

| Strategy | Scope | Meaning |
|----------|-------|---------|
| Per poll | `poll:{id}` | One vote per poll (default) |
| Per platform | `happyvote-aztec` | Rare |
| Per election family | `election:…` | One vote in a group |

The form offers two author modes. **Public address** stores the account that sent `create_user_poll`. **Private** stores a Poseidon2 commitment (tally tag 205) instead of the address. The secret stays in a note on `HiddenAuthorBook`, which is the only contract allowed to create or finish that poll. End and pool funding prove the secret in a private call on the book. The published caller on HappyVote is the book, not the account. On that path a sponsor contract is the fee payer, so the account is not published as the payer of the create or end transaction. Testnet uses the canonical Sponsored FPC. Mainnet uses `AuthorFeeSponsor` from this source. `HiddenAuthorBook` is deployed on this Testnet. `AuthorFeeSponsor` is not deployed. The sponsor's admin can pause new sponsorships. The pause check does not take the author's address. Fee Juice is bridged to the sponsor and cannot be transferred to the author. A private ballot still hides the voter. ZKPassport is not bound to the author. The catalog signing key is not an account key. A private-author listing omits the account address.

## 5.1 Ethereum wallet account

An Ethereum wallet can open one stable Aztec account. Browser session stays the first choice.

The page asks for one `personal_sign`. The message names the page origin, the Ethereum address, and account version 1, and it says the signature is the account key. HKDF-SHA256 of the canonical signature derives the Aztec secret, the account salt, and the signing key. The account is an initializerless Schnorr account, with no account-deploy transaction. The same wallet, the origin `https://aztec.happyvote.xyz`, and the same message open the same Aztec address. Another origin opens another account. The message wording is fixed. Changing it would open a different account.

The Ethereum address and the signature are not sent to the HappyVote server. They are not stored as a server binding. They are not fields of the ballot, the nullifier, or a ZKPassport attestation. The page sees the Ethereum address while it derives the keys. That stays in the browser. This browser may keep an encrypted copy (`happyvote-ethereum-account-v1` in IndexedDB) so the next connect can skip the signature. Disconnect does not delete it. Clearing site data does. Signing the same message again restores the same account.

The signature is the account key. Anyone who obtains it can derive the same Aztec keys. The line that names the site is a warning in the message. A wallet does not cryptographically bind `personal_sign` to the page origin. Sign only on https://aztec.happyvote.xyz.

The signature must recover the selected address. A contract wallet such as Safe cannot use this sign-in.

A private or sealed ballot still does not publish the voter. An open ballot still publishes the Aztec address and the choice. HappyVote does not publish which Ethereum wallet opened that address. The link exists for someone who has the signature, or who watched the sign-in in this browser.

On a phone, Safari or Chrome cannot complete this signature inside MetaMask or Rabby. The page recommends opening https://aztec.happyvote.xyz/ in the wallet’s own browser and offers a button that copies that address. The account is not in that address. If the wallet’s browser already injects a provider, the user can sign there.

## 6. What we do not promise

1. Full IP / timing anonymity (no Tor/relayer in MVP).
2. Fee-metadata privacy beyond Sponsored FPC patterns.
3. Official election-commission status.

Site visit totals are a separate first-party counter (no cookies, no stored IP, no poll IDs). The host derives a country code from the request IP and then discards the IP. The lookup stays on the host. These totals are not linked to ballots.

## 7. Required UI copy

- **Private:** address hidden; the chosen option still updates the public tally (unless sealed).
- **Open:** address and choice are public.
- **Ethereum wallet:** the signature is the account key. HappyVote does not receive the Ethereum address or the signature. Sign only on https://aztec.happyvote.xyz.
- **ZKPassport:** HappyVote does not receive passport document data.
- **Author:** public-address mode stores the creator’s Aztec address. Private mode stores a commitment and leaves the address off the poll. A private ballot still hides the voter.

## 8. Privacy checklist

- [x] Nullifier per poll (`SingleUseClaim`), optionally per UTC day
- [x] Private and open share one claim domain
- [x] `option_id` range + reject Field→u32 truncation
- [x] No vote after `end_poll` / `ends_at` / cancel
- [x] No zero-address fallbacks on required client paths
- [x] `metadata_hash` ↔ off-chain JSON
- [x] Server re-verify ZKPassport for gated polls
- [x] On-chain identity claim
- [x] Sealed tallies
- [x] Site visit aggregates isolated from ballots (no cookies, no stored IP, no poll id)
- [x] Ethereum sign-in: address and signature stay off the server and off the ballot
- [ ] Real-device ZKPassport E2E
