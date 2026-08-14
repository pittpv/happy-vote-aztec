# HappyVote on Aztec — Web

UI for https://aztec.happyvote.xyz.

## Dev

```bash
# From the Aztec project root in WSL after local network is up:
#   npm run smoke   # deploys + writes web/.env.local
#
# Or:
cp .env.example .env.local
# set VITE_HAPPY_VOTE_CONTRACT_ADDRESS from smoke or docs

npm install
npm run dev   # http://localhost:5174
```

Smoke creates poll `1` with the deploy account. The web **Connect** flow deploys a *new* voter account — voting works from that session.

## Features

- Brand **HappyVote on Aztec** + mission / privacy pillars + author links
- Poll catalog with search / filters
- Poll pages `/p/:id` — 1080px, ballot | live results
- Private vs open ballot (when policy = voter_choice)
- Public tallies without a wallet (`/api/poll-state`)
- Connect Aztec account (EmbeddedWallet + IndexedDB PXE)
- ZKPassport gate + server re-verify + collapse to **Identity verified**
- On-chain identity claim for personhood/gated polls
- Sealed tallies hidden until close
- Sticky mobile CTA + option bars
- Legal pages, SEO (Open Graph, JSON-LD, sitemap)
- Honest private-vote copy (address hidden; live tally still public)

Docs: [user guide](../../docs/aztec/en/11-USER-GUIDE.md) · [UI/UX](../../docs/aztec/en/12-UI-UX.md) · [Русский](../../docs/aztec/ru/README.md)

## Public tallies API

```
GET /api/poll-state?pollId=1&optionsCount=2
```

See [hosting](../../docs/aztec/en/09-HOSTING.md). Recompute Poseidon slots after storage layout changes: `node scripts/compute-slots.mjs`.

## Headers / proving

Vite + `vercel.json`: COOP/COEP (`credentialless`). CSP must allow CRS CDN (`crs.aztec-cdn.foundation`) or proving fails with `Failed to fetch`.
