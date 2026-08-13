# Hosting — aztec.happyvote.xyz

| Item | Value |
|------|-------|
| Domain | `aztec.happyvote.xyz` |
| App | `web/` (Vite React) |
| Host | Vercel |
| Aztec network | Testnet **5.1.0** → Alpha later |

DNS: CNAME `aztec` → the host target, HTTPS on. The same domain is registered in [ZKPassport Dashboard](https://dashboard.zkpassport.id).

Public frontend variables (contract address is in [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md)):

```
VITE_AZTEC_NODE_URL=https://v5.testnet.rpc.aztec-labs.com
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=<see 10-TESTNET-ADDRESSES.md>
VITE_SPONSORED_FPC_ADDRESS=0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296
VITE_DEFAULT_POLL_ID=1
VITE_PROVER_ENABLED=true
VITE_ZKPASSPORT_ENABLED=true
VITE_ZKPASSPORT_DOMAIN=aztec.happyvote.xyz
```

Operator secrets stay in the host’s environment only. They are not in this repository.

## Public APIs

| Endpoint | Role |
|----------|------|
| `GET /api/poll-state?pollId=1&optionsCount=2` | Guest tallies (cached). Zeros while a poll is sealed and still active. |
| `GET /api/polls` | Shared catalog (seed JSON; optional hosted overlay) |
| `POST /api/zkpassport-verify` | Server re-verify of ZKPassport proofs |

Example tally payload:

```json
{"tallies":[1,0],"total":1,"policy":2,"sealed":false}
```

## SEO

| File | Role |
|------|------|
| `web/index.html` | Default title, description, Open Graph, JSON-LD |
| `web/src/lib/seo.js` | Per-route title / canonical / WebPage schema |
| `web/public/robots.txt` | Allow `/`, sitemap |
| `web/public/sitemap.xml` | Home, polls `/p/1` `/p/2`, legal pages |

No third-party analytics counter. Privacy Policy and Cookie Policy describe hosting logs, localStorage, and third-party wallets / ZKPassport only.

## Status

- [x] DNS → `aztec.happyvote.xyz`
- [x] Production UI
- [x] Guest public tallies without wallet
- [x] Legal pages, sitemap, robots, JSON-LD
