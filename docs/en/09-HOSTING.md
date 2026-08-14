# Hosting — aztec.happyvote.xyz

## Target

| Item | Value |
|------|-------|
| Domain | `aztec.happyvote.xyz` |
| App | `web/` (Vite React) |
| Host | Vercel |

| Aztec network (prod) | Testnet **5.1.0** → Alpha later |

In the HappyVote monorepo the Vite app is `aztec/web` and Vercel Root Directory is `aztec/web`. In the standalone public repo the Root Directory is `web`.

## DNS

CNAME `aztec` → Vercel target, HTTPS on. Register the same domain in [ZKPassport Dashboard](https://dashboard.zkpassport.id).

## Vercel

**Production URL:** https://aztec.happyvote.xyz

```bash
# from the directory that matches the Vercel Root Directory parent
vercel deploy --prod --yes
```

Build (inside `web/`): `npm install` then `npm run build` → `dist`.

### Env (Production)

```
VITE_AZTEC_NODE_URL=https://v5.testnet.rpc.aztec-labs.com
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x0aa005e43bda26d68556ea21509c907f48a689bdb9ea5355363e695d08e5eea7
VITE_SPONSORED_FPC_ADDRESS=0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296
VITE_DEFAULT_POLL_ID=1
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
VITE_ZKPASSPORT_ENABLED=true
VITE_ZKPASSPORT_DOMAIN=aztec.happyvote.xyz
VITE_ZKPASSPORT_DEFAULT_POLICY=vote-identity-verification
```

`VITE_*` vars are also read by serverless poll APIs. Live contract: [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md). Catalog overlay uses host secrets that are not committed.

### `vercel.json`

| Setting | Purpose |
|---------|---------|
| COOP `same-origin` + COEP `credentialless` | SharedArrayBuffer / bb.js WASM proving |
| CORP on `/assets/*` | Cross-origin isolation |
| CSP `connect-src` | Node RPC, CRS CDN, faucet, demo-wallet, fonts, ZKPassport, Alchemy registry |
| CSP `script-src` | `'wasm-unsafe-eval'` / `'unsafe-eval'` for prover |
| SPA rewrite | `/((?!api/\|robots.txt\|sitemap.xml\|favicon.svg).*)` → `/index.html` |
| Permissions-Policy | camera/mic/geo off |

Without CRS hosts in `connect-src`, proving fails with opaque `Failed to fetch`.

## Guest tallies API

Public Aztec Labs RPC rate-limits browsers (HTTP 429).

| Item | Value |
|------|-------|
| Endpoint | `GET /api/poll-state?pollId=1&optionsCount=2` |
| File | `web/api/poll-state.js` |
| Behavior | Batch `node_getPublicStorageAt`, cache ~15s |
| Frontend | `readPublicPollState()` → same-origin fetch only |

Example:

```json
{"tallies":[1,0],"total":1,"policy":2,"sealed":false,"voteEnded":false,"cancelled":false,"paused":false,"startsAt":0,"endsAt":0,"votingOpen":true}
```

While a poll is sealed and still active, tallies are returned as zeros. `paused`, `cancelled`, `startsAt`, `endsAt`, and `votingOpen` reflect on-chain flags so guests can see a locked ballot without a wallet.

Never put a freshly constructed `AztecAddress` in a React `useEffect` dependency array — use a stable address string.

## Shared poll catalog API

| Item | Value |
|------|-------|
| List | `GET /api/polls` |
| One | `GET /api/polls?id=3` |
| Publish | Authenticated `POST /api/polls` (operator-only) |
| Seed | `web/data/polls-catalog.json` |
| Overlay | Optional object storage overlay on the host |

Without Blob, everyone still sees the seed catalog.

## ZKPassport verify

`POST /api/zkpassport-verify` — server re-verify with `@zkpassport/sdk` (memory 2048 MB, 60s). Domain `aztec.happyvote.xyz`.

## Client errors

`POST /api/client-error` — JSON `{ message, stack?, pollId? }` → Vercel logs.

## SEO and static files

| File | Role |
|------|------|
| `web/index.html` | Default title, description, Open Graph, JSON-LD |
| `web/src/lib/seo.js` | Per-route title / canonical / WebPage schema |
| `web/public/robots.txt` | Allow `/`, sitemap |
| `web/public/sitemap.xml` | Home, polls `/p/1` `/p/2` `/p/3`, legal pages |

## Analytics

No third-party analytics counter. Privacy Policy and Cookie Policy describe hosting logs, localStorage, and third-party wallets / ZKPassport only.

## Status

- [x] DNS CNAME → `aztec.happyvote.xyz`
- [x] Vercel production
- [x] Testnet contract in env
- [x] CSP includes CRS CDN + ZKPassport
- [x] Guest public tallies without wallet
- [x] Legal pages, sitemap, robots, JSON-LD
- [ ] End-to-end vote smoke on production URL (manual Connect)
