# HappyVote on Aztec — Documentation

**Product:** private-by-default voting on Aztec Network  
**URL:** https://aztec.happyvote.xyz  
**Network / SDK:** Aztec `5.1.0` (Testnet → Alpha)  
**Public repo:** https://github.com/pittpv/happy-vote-aztec  
**Languages:** [English](./README.md) · [Русский](../ru/README.md)

## Contents

| Document | Purpose |
|----------|---------|
| [01-PRODUCT-SPEC.md](./01-PRODUCT-SPEC.md) | Product requirements, roles, poll types, privacy modes |
| [02-ARCHITECTURE.md](./02-ARCHITECTURE.md) | On-chain / off-chain architecture, contract, APIs (diagrams) |
| [03-PRIVACY-MODEL.md](./03-PRIVACY-MODEL.md) | Private / open ballots, sealed tallies, identity |
| [04-ZKPASSPORT.md](./04-ZKPASSPORT.md) | Personhood / eligibility via ZKPassport |
| [05-DEVELOPMENT-PLAN.md](./05-DEVELOPMENT-PLAN.md) | Iteration plan and status |
| [09-HOSTING.md](./09-HOSTING.md) | Domain, public APIs, SEO |
| [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md) | Live Testnet 5.1.0 addresses |
| [11-USER-GUIDE.md](./11-USER-GUIDE.md) | How to connect and vote |
| [12-UI-UX.md](./12-UI-UX.md) | Landing, vote page, ZKPassport gate, SEO |
| [13-LEGAL.md](./13-LEGAL.md) | Terms, Privacy, Cookies, Data Safety, GDPR |
| [../../AGENTS.md](../../AGENTS.md) | AI / CLI rules ([Aztec AI tooling](https://docs.aztec.network/developers/ai_tooling)) |

## Product vision

A minimal voting portal for **any topic**: binary sentiment (Happy/Sad), multi-option polls, and important gated votes.

1. **Programmable privacy** — a ballot can hide the voter while the tally stays public (or sealed until close).
2. **Voter choice** — private (default) or open, when the poll policy allows it.
3. **ZKPassport** — personhood / age / nationality without sending passport data to HappyVote.
4. **Two creation iterations** — operators first; later, user-created polls.

## Principles

- **Minimal UI** — question, options, one primary CTA.
- **Privacy by design** — private ballot by default; public only on explicit action.
- **Honest copy** — private mode hides the **address**, not the live option count.
- **Verifiable results** — tallies on-chain; poll rules in the contract.
- **Aztec-native tooling** — `aztec` CLI, Poseidon2, SDK version = network version.
- **No identity custody** — ZKPassport document data stays on the voter’s device.

## Live status (2026-08-14)

Single contract `HappyVote` on **Aztec Testnet 5.1.0**: [`0x0c7ea71e9619ee7ae5285f8912bf566a7c4ce9a65ef089098289f589b4b4a55c`](https://testnet.aztecscan.xyz/address/0x0c7ea71e9619ee7ae5285f8912bf566a7c4ce9a65ef089098289f589b4b4a55c). Polls `/p/1` Happy/Sad, `/p/2` single-choice, `/p/3` ZKPassport personhood. Noir tests **40/40**. Frontend: https://aztec.happyvote.xyz.

## Official sources

- Aztec docs: https://docs.aztec.network/
- Networks: https://docs.aztec.network/networks
- ZKPassport: https://zkpassport.id/ · https://docs.zkpassport.id/
- Starter: https://github.com/AztecProtocol/aztec-starter
