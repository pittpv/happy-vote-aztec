# HappyVote on Aztec

Private-by-default voting on [Aztec Network](https://aztec.network). Stable **6.0.0** is on Testnet and Mainnet. This site votes on Testnet.

**Live:** https://aztec.happyvote.xyz  
**Docs:** [English](./docs/en/README.md) · [Русский](./docs/ru/README.md)

Cast a **private or open** ballot. Tallies are public (or sealed until the poll closes). Important polls can require [ZKPassport](https://zkpassport.id/) personhood without sending passport data to HappyVote.

## What this repo contains

| Path | Contents |
|------|----------|
| `src/main.nr` | `HappyVote` Aztec.nr contract (multi-poll) |
| `src/test/` | Noir tests |
| `scripts/` | Contract deploy helpers |
| `web/` | Vite + React UI and Vercel serverless APIs |
| `docs/en` · `docs/ru` | Product, architecture (Mermaid), privacy, user guide |

Related EVM HappyVote is a **separate** product. This repository is Aztec-only.

Compile and test with the **`aztec` CLI** (not `nargo` or `bb` directly). Official setup: https://docs.aztec.network/developers/getting_started

## Testnet

Contract: [`0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14`](https://testnet.aztecscan.xyz/address/0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14)  
RPC: `https://aztec-testnet.drpc.org`  
Sponsored FPC: `0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3`  
Details: [docs/en/10-TESTNET-ADDRESSES.md](./docs/en/10-TESTNET-ADDRESSES.md)

Testnet 6.0.0 is a new genesis relative to 5.1.0. The Testnet 5.1.0 contract is not on this network. Earlier ballots are listed on the site under **Earlier networks** when a live read or a saved snapshot exists.

## Architecture (short)

```mermaid
flowchart LR
  Browser --> APIs["Vercel APIs"]
  Browser --> PXE["aztec.js PXE"]
  Browser --> ZKP[ZKPassport]
  APIs --> Node[Aztec Testnet RPC]
  PXE --> HV[HappyVote contract]
  ZKP --> Verify["/api/zkpassport-verify"]
```

Private vote: `SingleUseClaim` nullifier → public tally increment (address stays hidden).  
See [docs/en/02-ARCHITECTURE.md](./docs/en/02-ARCHITECTURE.md).

## License

MIT (HappyVote). Some files originate from [aztec-starter](https://github.com/AztecProtocol/aztec-starter) (Apache-2.0).

## Author

Peter Ploskikh — [X](https://x.com/pittpv) · [LinkedIn](https://www.linkedin.com/in/peter-ploskikh/) · [GitHub](https://github.com/pittpv/)
