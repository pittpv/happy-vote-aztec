# Адреса Testnet — HappyVote on Aztec

Сеть: **Aztec Testnet 6.0.0**  
RPC: `https://aztec-testnet.drpc.org`  
Explorer: https://testnet.aztecscan.xyz  
Задеплоено: 2026-11-05T10:54:39.854Z

| Что | Значение |
|------|----------|
| HappyVote | [`0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1`](https://testnet.aztecscan.xyz/address/0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1) |
| HiddenAuthorBook | [`0x2f5b5795a7f052fbde514dc1b5bd20aacd802729cc803c4bb3c3fd5ea46558de`](https://testnet.aztecscan.xyz/address/0x2f5b5795a7f052fbde514dc1b5bd20aacd802729cc803c4bb3c3fd5ea46558de) |
| Sponsored FPC | `0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3` |
| Опросы | `1` Happy/Sad (ежедневно) · `2` single-choice (3 варианта) · `3` ZKPassport personhood · `4` sealed tallies |
| Eligibility | `0` open · `1` ZKPassport personhood · `2` gated |

Testnet 6.0.0 — новый genesis. Транзакции и адрес HappyVote с Testnet 6.0.0-rc.3 на этой сети недействительны. Тот же стабильный образ **6.0.0** стоит на Mainnet (`https://aztec-mainnet.drpc.org`). Этот сайт голосует в Testnet.

HappyVote принимает публичного автора через `create_user_poll` и приватного через `HiddenAuthorBook`. Книга — единственный вызывающий скрытых функций создания и завершения. В Testnet эти транзакции приватного автора платит канонический Sponsored FPC. `AuthorFeeSponsor` — плательщик для Mainnet в этом исходнике, он не развёрнут.

Прежний контракт Testnet 6.0.0 [`0x08cc6d5b022900717c01af9b2800a83177aeab263cfd920416b33b56f6bc5881`](https://testnet.aztecscan.xyz/address/0x08cc6d5b022900717c01af9b2800a83177aeab263cfd920416b33b56f6bc5881) остаётся в секции **Earlier networks** вместе с записанными итогами. Эти строки не открывают `/p/:id`. Опросы 1–4 на адресе выше начинаются с нуля. Более ранний контракт Testnet 6.0.0 [`0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14`](https://testnet.aztecscan.xyz/address/0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14) тоже остаётся в этом архиве.

## Env фронтенда

```
VITE_AZTEC_NODE_URL=https://aztec-testnet.drpc.org
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1
VITE_HIDDEN_AUTHOR_BOOK_ADDRESS=0x2f5b5795a7f052fbde514dc1b5bd20aacd802729cc803c4bb3c3fd5ea46558de
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
```
