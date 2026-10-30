# Адреса Testnet — HappyVote on Aztec

Сеть: **Aztec Testnet 6.0.0**  
RPC: `https://aztec-testnet.drpc.org`  
Explorer: https://testnet.aztecscan.xyz  
Задеплоено: 2026-10-24T22:08:44.516Z

| Что | Значение |
|------|----------|
| HappyVote | [`0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14`](https://testnet.aztecscan.xyz/address/0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14) |
| Sponsored FPC | `0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3` |
| Опросы | `1` Happy/Sad (ежедневно) · `2` single-choice (3 варианта) · `3` ZKPassport personhood · `4` sealed tallies |
| Eligibility | `0` open · `1` ZKPassport personhood · `2` gated |

Testnet 6.0.0 — новый genesis. Транзакции и адрес HappyVote с Testnet 6.0.0-rc.3 на этой сети недействительны. Тот же стабильный образ **6.0.0** стоит на Mainnet (`https://aztec-mainnet.drpc.org`). Контракт выше — деплой Testnet.

## Env фронтенда

```
VITE_AZTEC_NODE_URL=https://aztec-testnet.drpc.org
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
```
