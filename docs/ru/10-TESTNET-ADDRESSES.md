# Адреса Testnet — HappyVote on Aztec

Сеть: **Aztec Testnet 5.1.0**  
RPC: `https://v5.testnet.rpc.aztec-labs.com`  
Explorer: https://testnet.aztecscan.xyz  
Деплой: 2026-08-14T12:09:35.572Z

| Item | Value |
|------|-------|
| HappyVote | [`0x0c7ea71e9619ee7ae5285f8912bf566a7c4ce9a65ef089098289f589b4b4a55c`](https://testnet.aztecscan.xyz/address/0x0c7ea71e9619ee7ae5285f8912bf566a7c4ce9a65ef089098289f589b4b4a55c) |
| Sponsored FPC | `0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296` |
| Poll id | `1` Happy/Sad · `2` single-choice · `3` ZKPassport personhood · `voter_choice` |
| Eligibility | `0` open · `1` personhood · `2` gated |

```
VITE_AZTEC_NODE_URL=https://v5.testnet.rpc.aztec-labs.com
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x0c7ea71e9619ee7ae5285f8912bf566a7c4ce9a65ef089098289f589b4b4a55c
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
```

Секретные ключи аккаунта — в `.env` (gitignore), не в этом файле.
