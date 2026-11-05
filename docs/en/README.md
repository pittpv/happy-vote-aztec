# HappyVote on Aztec — Documentation

**Product:** private-by-default voting on Aztec Network  
**URL:** https://aztec.happyvote.xyz  
**Network / SDK:** Aztec **6.0.0** stable on Testnet and Mainnet. This site votes on Testnet.  
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
| [09-HOSTING.md](./09-HOSTING.md) | DNS, Vercel, CSP, APIs |
| [10-TESTNET-ADDRESSES.md](./10-TESTNET-ADDRESSES.md) | Live Testnet 6.0.0 addresses |
| [11-USER-GUIDE.md](./11-USER-GUIDE.md) | How to connect and vote |
| [12-UI-UX.md](./12-UI-UX.md) | Landing, vote page, ZKPassport gate, SEO |
| [13-LEGAL.md](./13-LEGAL.md) | Terms, Privacy, Cookies, Data Safety, GDPR |
| [../../AGENTS.md](../../../AGENTS.md) | AI / CLI rules ([Aztec AI tooling](https://docs.aztec.network/developers/ai_tooling)) |

## Product vision

A minimal voting portal for **any topic**: binary sentiment (Happy/Sad), multi-option polls, and important gated votes.

1. **Programmable privacy** — a ballot can hide the voter while the tally stays public (or sealed until close).
2. **Voter choice** — private (default) or open, when the poll policy allows it.
3. **ZKPassport** — personhood / age / nationality without sending passport data to HappyVote.
4. **Two creation paths** — HappyVote publishes the featured polls. A connected account publishes a single-choice poll at `/create` with the same Connect dialog as voting. The author can be a public address or private. Private creation goes through the deployed `HiddenAuthorBook`. On Testnet the Sponsored FPC pays a private-author create and an early end. On Mainnet that payer is the AuthorFeeSponsor contract in this source. AuthorFeeSponsor is not deployed, so a Mainnet site keeps Private off until that address is configured. **Your polls** lists that address and the private polls in that wallet, and can end a poll early.

## Principles

- **Minimal UI** — question, options, one primary CTA.
- **Privacy by design** — private ballot by default; public only on explicit action.
- **Honest copy** — private mode hides the **address**, not the live option count.
- **Verifiable results** — tallies on-chain; poll rules in the contract.
- **Aztec-native tooling** — `aztec` CLI, Poseidon2, SDK version = network version.
- **No identity custody** — ZKPassport document data stays on the voter’s device.

## Live status (2026-11-04)

`HappyVote` on **Aztec Testnet 6.0.0**: [`0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1`](https://testnet.aztecscan.xyz/address/0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1). Private author uses [`HiddenAuthorBook`](https://testnet.aztecscan.xyz/address/0x2f5b5795a7f052fbde514dc1b5bd20aacd802729cc803c4bb3c3fd5ea46558de) `0x2f5b5795a7f052fbde514dc1b5bd20aacd802729cc803c4bb3c3fd5ea46558de`. The same stable **6.0.0** image is on Aztec Mainnet. This site votes on Testnet. Stable 6.0.0 is a new genesis: Testnet 6.0.0-rc.3 transactions are not on this network. Polls `/p/1` Happy/Sad, `/p/2` single-choice, `/p/3` ZKPassport personhood, `/p/4` sealed tallies start on this address. Noir tests: HappyVote 66, HiddenAuthorBook 14, AuthorFeeSponsor 6. Create stores a user poll on this contract. Ballots from the previous Testnet 6.0.0 contract [`0x08cc6d5b022900717c01af9b2800a83177aeab263cfd920416b33b56f6bc5881`](https://testnet.aztecscan.xyz/address/0x08cc6d5b022900717c01af9b2800a83177aeab263cfd920416b33b56f6bc5881) stay in **Earlier networks**, with the older contract [`0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14`](https://testnet.aztecscan.xyz/address/0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14). Those rows are not links to `/p/:id`. Frontend: https://aztec.happyvote.xyz.

## Official sources

- Aztec docs: https://docs.aztec.network/
- Networks: https://docs.aztec.network/networks
- ZKPassport: https://zkpassport.id/ · https://docs.zkpassport.id/
- Starter: https://github.com/AztecProtocol/aztec-starter
