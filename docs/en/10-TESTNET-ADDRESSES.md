# Testnet addresses — HappyVote on Aztec

Network: **Aztec Testnet 6.0.0-rc.3**  
RPC: `https://aztec-testnet.drpc.org`  
Explorer: https://testnet.aztecscan.xyz  
Deployed: 2026-10-18T15:26:43.125Z

| Item | Value |
|------|-------|
| HappyVote | [`0x147d56082a923fb872c9ea28e4e57b3596f27b518f95c51c825839024d61beba`](https://testnet.aztecscan.xyz/address/0x147d56082a923fb872c9ea28e4e57b3596f27b518f95c51c825839024d61beba) |
| Sponsored FPC | `0x2adfb70e860909f0db8268b3fec80bce52a94559963444f5c0341816b8412130` |
| Poll id | `1` Happy/Sad (daily) · `2` single-choice (3 opts) · `3` ZKPassport personhood · `4` sealed tallies |
| Eligibility modes | `0` open · `1` ZKPassport personhood · `2` gated |

Testnet 6.0.0-rc.3 is a new genesis. Transactions and the HappyVote address from Testnet 5.1.0 are not on this network.

## Frontend env

```
VITE_AZTEC_NODE_URL=https://aztec-testnet.drpc.org
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x147d56082a923fb872c9ea28e4e57b3596f27b518f95c51c825839024d61beba
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=0x2adfb70e860909f0db8268b3fec80bce52a94559963444f5c0341816b8412130
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
```
