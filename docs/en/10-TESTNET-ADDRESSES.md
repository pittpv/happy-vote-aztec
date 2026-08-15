# Testnet addresses — HappyVote on Aztec

Network: **Aztec Testnet 5.1.0**  
RPC: `https://v5.testnet.rpc.aztec-labs.com`  
Explorer: https://testnet.aztecscan.xyz  
Deployed: 2026-08-15T14:01:28.373Z

| Item | Value |
|------|-------|
| HappyVote | [`0x2e10858cf6750c003489a62f570535966fb940bb10d18a0c146a36cac64713b6`](https://testnet.aztecscan.xyz/address/0x2e10858cf6750c003489a62f570535966fb940bb10d18a0c146a36cac64713b6) |
| Sponsored FPC | `0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296` |
| Poll id | `1` Happy/Sad (daily) · `2` single-choice (3 opts) · `3` ZKPassport personhood test · `voter_choice` |
| Eligibility modes | `0` open · `1` ZKPassport personhood · `2` gated |

## Frontend env

```
VITE_AZTEC_NODE_URL=https://v5.testnet.rpc.aztec-labs.com
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x2e10858cf6750c003489a62f570535966fb940bb10d18a0c146a36cac64713b6
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
```

Account keys stay in gitignored `.env`, not in this file.
