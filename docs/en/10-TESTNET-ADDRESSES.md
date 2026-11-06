# Testnet addresses — HappyVote on Aztec

Network: **Aztec Testnet 6.0.0**  
RPC: `https://aztec-testnet.drpc.org`  
Explorer: https://testnet.aztecscan.xyz  
Deployed: 2026-11-05T21:52:10Z

| Item | Value |
|------|-------|
| HappyVote | [`0x12b946b72a45a75719bd4af4f1697d99e02acf45d79876b8cbce1df115783fb0`](https://testnet.aztecscan.xyz/address/0x12b946b72a45a75719bd4af4f1697d99e02acf45d79876b8cbce1df115783fb0) |
| HiddenAuthorBook | [`0x14142f160aad70469e2702ad9d52d8c9cee5f9724ed58983329ce9c7e10c4bb8`](https://testnet.aztecscan.xyz/address/0x14142f160aad70469e2702ad9d52d8c9cee5f9724ed58983329ce9c7e10c4bb8) |
| Sponsored FPC | `0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3` |
| Poll id | `1` Happy/Sad (daily) · `2` Iteration 3 roadmap (3 opts) · `3` ZKPassport personhood · `4` sealed tallies |
| Eligibility modes | `0` open · `1` ZKPassport personhood · `2` gated |

Testnet 6.0.0 is a new genesis. Transactions and the HappyVote address from Testnet 6.0.0-rc.3 are not on this network. The same stable **6.0.0** image is on Aztec Mainnet (`https://aztec-mainnet.drpc.org`). This site votes on Testnet.

HappyVote accepts a public author through `create_user_poll` and a private author through `HiddenAuthorBook`. The book is the only caller of the hidden create and finish functions. On Testnet the canonical Sponsored FPC pays those private-author transactions. `AuthorFeeSponsor` is the Mainnet payer in this source and is not deployed.

Earlier networks keeps Testnet 5.1.0 [`0x2e10858cf6750c003489a62f570535966fb940bb10d18a0c146a36cac64713b6`](https://testnet.aztecscan.xyz/address/0x2e10858cf6750c003489a62f570535966fb940bb10d18a0c146a36cac64713b6) and the earlier Testnet 6.0.0 contract [`0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14`](https://testnet.aztecscan.xyz/address/0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14). The 4 Nov contract `0x08cc6d5b022900717c01af9b2800a83177aeab263cfd920416b33b56f6bc5881` is not in that archive. This deployment does not archive `0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1`. Archive rows do not open `/p/:id`. Polls 1–4 on the address above start empty.

## Frontend env

```
VITE_AZTEC_NODE_URL=https://aztec-testnet.drpc.org
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x12b946b72a45a75719bd4af4f1697d99e02acf45d79876b8cbce1df115783fb0
VITE_HIDDEN_AUTHOR_BOOK_ADDRESS=0x14142f160aad70469e2702ad9d52d8c9cee5f9724ed58983329ce9c7e10c4bb8
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
```
