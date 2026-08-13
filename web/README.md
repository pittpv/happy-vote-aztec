# HappyVote on Aztec — Web

UI for https://aztec.happyvote.xyz.

## Features

- Brand **HappyVote on Aztec** + mission / privacy pillars + author links
- Poll catalog with search / filters
- Poll pages `/p/:id` — 1080px, ballot | live results
- Private vs open ballot (when policy = voter_choice)
- Public tallies without a wallet (`GET /api/poll-state`)
- Connect Aztec account (EmbeddedWallet + IndexedDB PXE)
- ZKPassport gate + server re-verify + collapse to **Identity verified**
- On-chain identity claim for personhood/gated polls
- Sealed tallies hidden until close
- Sticky mobile CTA + option bars
- Legal pages, SEO (Open Graph, JSON-LD, sitemap)
- Honest private-vote copy (address hidden; live tally still public)

Docs: [user guide](../docs/en/11-USER-GUIDE.md) · [UI/UX](../docs/en/12-UI-UX.md) · [Русский](../docs/ru/README.md)
