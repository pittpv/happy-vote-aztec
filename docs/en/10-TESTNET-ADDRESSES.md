# Testnet addresses — HappyVote on Aztec

Network: **Aztec Testnet 5.1.0**  
RPC: `https://v5.testnet.rpc.aztec-labs.com`  
Explorer: https://testnet.aztecscan.xyz  
Deployed: 2026-08-13T10:21:20.131Z

| Item | Value |
|------|-------|
| HappyVote | [`0x0c5dbc2f68bf8e25f8ddc5c547d0ccf010ad4ed0262c6c1e09dc35cb0cdb3ac0`](https://testnet.aztecscan.xyz/address/0x0c5dbc2f68bf8e25f8ddc5c547d0ccf010ad4ed0262c6c1e09dc35cb0cdb3ac0) |
| Sponsored FPC | `0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296` |
| Poll id | `1` Happy/Sad · `2` single-choice (3 opts) · `3` ZKPassport personhood test · `voter_choice` |
| Eligibility modes | `0` open · `1` ZKPassport personhood · `2` gated |

## Frontend env

```
VITE_AZTEC_NODE_URL=https://v5.testnet.rpc.aztec-labs.com
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x0c5dbc2f68bf8e25f8ddc5c547d0ccf010ad4ed0262c6c1e09dc35cb0cdb3ac0
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296
VITE_PROVER_ENABLED=true
```
