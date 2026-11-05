# Testnet addresses — HappyVote on Aztec

Network: **Aztec Testnet 6.0.0**  
RPC: `https://aztec-testnet.drpc.org`  
Explorer: https://testnet.aztecscan.xyz  
Deployed: 2026-11-05T10:54:39.854Z

| Item | Value |
|------|-------|
| HappyVote | [`0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1`](https://testnet.aztecscan.xyz/address/0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1) |
| HiddenAuthorBook | [`0x2f5b5795a7f052fbde514dc1b5bd20aacd802729cc803c4bb3c3fd5ea46558de`](https://testnet.aztecscan.xyz/address/0x2f5b5795a7f052fbde514dc1b5bd20aacd802729cc803c4bb3c3fd5ea46558de) |
| Sponsored FPC | `0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3` |
| Poll id | `1` Happy/Sad (daily) · `2` single-choice (3 opts) · `3` ZKPassport personhood · `4` sealed tallies |
| Eligibility modes | `0` open · `1` ZKPassport personhood · `2` gated |

Testnet 6.0.0 is a new genesis. Transactions and the HappyVote address from Testnet 6.0.0-rc.3 are not on this network. The same stable **6.0.0** image is on Aztec Mainnet (`https://aztec-mainnet.drpc.org`). This site votes on Testnet.

HappyVote accepts a public author through `create_user_poll` and a private author through `HiddenAuthorBook`. The book is the only caller of the hidden create and finish functions. On Testnet the canonical Sponsored FPC pays those private-author transactions. `AuthorFeeSponsor` is the Mainnet payer in this source and is not deployed.

The previous Testnet 6.0.0 contract [`0x08cc6d5b022900717c01af9b2800a83177aeab263cfd920416b33b56f6bc5881`](https://testnet.aztecscan.xyz/address/0x08cc6d5b022900717c01af9b2800a83177aeab263cfd920416b33b56f6bc5881) stays under **Earlier networks**, with the tallies recorded there. Those rows do not open `/p/:id`. Polls 1–4 on the address above start empty. An older Testnet 6.0.0 contract, [`0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14`](https://testnet.aztecscan.xyz/address/0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14), remains in that same archive.

## Frontend env

```
VITE_AZTEC_NODE_URL=https://aztec-testnet.drpc.org
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1
VITE_HIDDEN_AUTHOR_BOOK_ADDRESS=0x2f5b5795a7f052fbde514dc1b5bd20aacd802729cc803c4bb3c3fd5ea46558de
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
```
