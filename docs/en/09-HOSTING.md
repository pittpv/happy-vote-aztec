# Hosting — aztec.happyvote.xyz

## Target

| Item | Value |
|------|-------|
| Domain | `aztec.happyvote.xyz` |
| App | `web/` (Vite React) |
| Host | HappyVote site for this domain |
| Aztec network (prod) | Stable **6.0.0** on Testnet and Mainnet. This site votes on Testnet. |

In the public repository the app directory is `web/`.

## DNS

`aztec.happyvote.xyz` is served over HTTPS. Register the same domain in [ZKPassport Dashboard](https://dashboard.zkpassport.id).

## Production

**URL:** https://aztec.happyvote.xyz

Public build settings:

```
VITE_AZTEC_NODE_URL=https://aztec-testnet.drpc.org
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x256692c1a2f24fe72c4351db82a72d0591225c132886c190d03a0069151f9f78
VITE_HIDDEN_AUTHOR_BOOK_ADDRESS=0x0db4e58ff03bd09d758c4e3aee0fb042b21e61aa410aad2f6a0b8f7537fefeec
VITE_SEALED_TALLY_BOOK_ADDRESS=0x11b4482fff1547eed30cb860cd9e017e1b84890539641ab3831d9c98b35d3b3d
VITE_SPONSORED_FPC_ADDRESS=0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3
VITE_DEFAULT_POLL_ID=1
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
VITE_ZKPASSPORT_ENABLED=true
VITE_ZKPASSPORT_DOMAIN=aztec.happyvote.xyz
VITE_ZKPASSPORT_DEFAULT_POLICY=vote-identity-verification
```

Those `VITE_*` values are also read by the site API. Live contract: [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md). The catalog overlay is a file on the host and is not part of the git tree.

### Response headers

The site sends the headers defined in `web/server.mjs`:

| Setting | Purpose |
|---------|---------|
| COOP `same-origin` + COEP `credentialless` | SharedArrayBuffer / bb.js WASM proving |
| CORP on `/assets/*` | Cross-origin isolation |
| CSP `connect-src` | Node RPC, CRS CDN, demo-wallet, fonts, ZKPassport, Alchemy registry |
| CSP `frame-src` / `child-src` | `'self'`, `blob:`, and `https://demo-wallet.aztec-labs.com` |
| CSP `script-src` | `'wasm-unsafe-eval'` / `'unsafe-eval'` for prover |
| Routes | `/`, `/polls`, `/create`, `/faq`, `/p/:id`, and `/legal/:slug` → `/api/document` (unique head). `/sitemap.xml` is generated from the catalog. `/llms.txt` and `/.well-known/ard.json` are static public files. Other app paths → `/index.html`. A missing file path returns 404 |
| Permissions-Policy | camera/mic/geo off |

Without CRS hosts in `connect-src`, proving fails with opaque `Failed to fetch`.

Connect lists Browser session, and wallet-sdk extensions after the user approves HappyVote in the wallet popup. Each extension appears under the name it sends. It does not open the Labs Demo Wallet. The public build is Aztec 5.0.1, so it cannot finish a 6.0.0 handshake, and it cannot prove a HappyVote ballot. `frame-src` still lists `https://demo-wallet.aztec-labs.com`.

## Guest tallies API

Public Aztec Labs RPC rate-limits browsers (HTTP 429).

| Item | Value |
|------|-------|
| Endpoint | `GET /api/poll-state?pollId=1&optionsCount=2` |
| Catalog cards | `GET /api/poll-state?catalog=1` → `{ polls: { "<id>": { closed, votingOpen, cancelled, paused, startsAt, endsAt } } }`. The read skips polls whose catalog `endsAt` is already past. Home and All polls use `closed` so an on-chain end moves a still-open card to **Ended**. Same ~15s cache |
| File | `web/api/poll-state.js` |
| Behavior | Batch `node_getPublicStorageAt`, cache ~15s. `?fresh=1` skips the cache and sends `Cache-Control: no-store` (after a ballot and on Refresh) |
| Map slots | Stored with catalog metadata at publish (any poll id). A baked JSON file is only a fallback for older records |
| Frontend | `readPublicPollState()` → same-origin fetch only |

Example:

```json
{"tallies":[1,0],"total":1,"policy":2,"sealed":false,"voteEnded":false,"cancelled":false,"paused":false,"startsAt":0,"endsAt":0,"votingOpen":true}
```

While a poll is sealed and still active, tallies are returned as zeros. The vote page does not paint those zeros on option buttons. `paused`, `cancelled`, `startsAt`, `endsAt`, and `votingOpen` reflect on-chain flags so guests can see a locked ballot without a wallet.

Never put a freshly constructed `AztecAddress` in a React `useEffect` dependency array — use a stable address string.

## Shared poll catalog API

| Item | Value |
|------|-------|
| List | `GET /api/polls` — polls still inside their catalog window, plus homepage polls. Ended polls that are not on the homepage: `GET /api/polls?ended=1&lane=authoritative\|users&offset=&limit=` (default 24, maximum 48) |
| One | `GET /api/polls?id=3` (vote pages fetch this first so overlay-only polls such as `/p/5` do not flash seed placeholders) |
| By author | `GET /api/polls?creator=` — listings for that address on the current contract, including polls past `endsAt`, plus the three open on-chain slots. Hidden titles are omitted. Your polls shows this response before it checks the wallet’s private-author note. |
| Closure | `GET /api/polls?closure=1,2` — public ended, cancelled, and end time for 1–12 ids. Your polls calls this after the wallet has read a private-author note. The author secret is not in the request. |
| Publish | Authenticated `POST /api/polls` (operator-only; poll body, `homepage` flags, or `policyId` on an existing ZKPassport poll) |
| Seed | `web/data/polls-catalog.json` |
| Overlay | Host file overlay. A missing file leaves the seed catalog. |
| Home | Catalog fields `showOnHome` and `homeRank` select cards on `/`. The creator of a poll cannot set those flags. `/polls` keeps **Authoritative polls** and **User polls**, each with **Active**, then one shared **Ended** section. Ended polls that are not on the homepage load 24 at a time per `lane`. Country filter also uses public Dashboard policy `nationality` / `issuing_country` when `policyId` is set. Replacing catalog `policyId` on an existing poll does not rewrite on-chain `metadata_hash`. |
| Cache | Overlay hits may be cached ~30s. A seed-only miss (overlay unread) is cached only briefly. Unknown-id `404` is not stored on the CDN. |

Without the overlay, everyone still sees the seed catalog. Overlay polls appear after `GET /api/polls?id=` succeeds.

## Listing check

`POST /api/polls` checks a user listing in the site process (`web/api/verify-account-poll.js`). That process has the installed dependency tree, including `pino-pretty`. A public-author listing and a private-author listing share this check. The private-author secret and the ballot stay off this request.

## ZKPassport verify

`POST /api/zkpassport-verify` — server re-verify with `@zkpassport/sdk`. Domain `aztec.happyvote.xyz`.

## Client errors

`POST /api/client-error` — JSON `{ message, stack?, pollId? }` → host logs.

## SEO and static files

| File | Role |
|------|------|
| `web/index.html` | Default title, description, Open Graph, Twitter, JSON-LD |
| `web/api/document.js` | Same shell with a unique title, description, canonical, Open Graph, Twitter card, and JSON-LD for `/`, `/polls`, `/create`, `/faq`, `/p/:id`, and legal pages |
| `web/api/og.js` | Share image whose URL is unique per path |
| `web/src/lib/seo.js` | Client tags kept in step with that head. Each poll is a `Question` with one `Answer` per option |
| `web/public/robots.txt` | Allow `/`, sitemap |
| `web/public/llms.txt` | Markdown summary of the public site for agents. No operator paths |
| `web/public/.well-known/ard.json` | Empty agent catalog. No MCP server, remote wallet, or identity API |
| `web/api/sitemap.js` | `GET /sitemap.xml`: home, All polls, Create, FAQ, legal pages, and every public poll on the current contract. Hidden polls are omitted |

## Analytics

No third-party analytics counter. A first-party cookieless endpoint `POST /api/site-stats` records daily aggregates only (pageviews, approximate uniques, country, coarse section, device class, browser family, referrer host). The host reads the request IP only to derive a country code and a same-day uniqueness hash, then discards it. The country lookup stays on this host and is not sent to a geo service. Counts below 3 visits are grouped. Poll IDs are not recorded. Operator-only `GET /api/site-stats` returns those aggregates. Privacy Policy and Cookie Policy describe this counter, hosting logs, localStorage, and third-party wallets / ZKPassport.

## Status

- [x] `aztec.happyvote.xyz` served over HTTPS
- [x] Testnet contract in the public build settings
- [x] CSP includes CRS CDN, ZKPassport, and the Demo Wallet iframe (`frame-src`)
- [x] Guest public tallies without wallet
- [x] Legal pages, sitemap, robots, JSON-LD
- [ ] End-to-end vote smoke on production URL (manual Connect)
