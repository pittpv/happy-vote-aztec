# Адреса Testnet — HappyVote on Aztec

Сеть: **Aztec Testnet 6.0.0**  
RPC: `https://aztec-testnet.drpc.org`  
Explorer: https://testnet.aztecscan.xyz  
Задеплоено: 2026-11-06T12:20:16Z

| Что | Значение |
|------|----------|
| HappyVote | [`0x00e30a477cfd54d6a5d8372ab955b5e5197099164f11f9bb5b192c5892b96bf3`](https://testnet.aztecscan.xyz/address/0x00e30a477cfd54d6a5d8372ab955b5e5197099164f11f9bb5b192c5892b96bf3) |
| HiddenAuthorBook | [`0x02c54586f55c07ea3faaf5f764cb86fb4d2e696b0b9ce9d81fbe5dc7f7703d29`](https://testnet.aztecscan.xyz/address/0x02c54586f55c07ea3faaf5f764cb86fb4d2e696b0b9ce9d81fbe5dc7f7703d29) |
| SealedTallyBook | [`0x0be7a7a9372daf7303e4545ebc3e62273a4a4ba039ea4fa9e9a10b626ef1237d`](https://testnet.aztecscan.xyz/address/0x0be7a7a9372daf7303e4545ebc3e62273a4a4ba039ea4fa9e9a10b626ef1237d) |
| Sponsored FPC | `0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3` |
| Опросы | `1` Happy/Sad (ежедневно) · `2` дорожная карта Итерации 3 (3 варианта) · `3` ZKPassport personhood · `4` sealed tallies |
| Eligibility | `0` open · `1` ZKPassport personhood · `2` gated |

Testnet 6.0.0 — новый genesis. Транзакции и адрес HappyVote с Testnet 6.0.0-rc.3 на этой сети недействительны. Тот же стабильный образ **6.0.0** стоит на Mainnet (`https://aztec-mainnet.drpc.org`). Этот сайт голосует в Testnet.

HappyVote принимает публичного автора через `create_user_poll` и приватного через `HiddenAuthorBook`. Книга — единственный вызывающий скрытых функций создания и завершения. Sealed-бюллетень идёт в `SealedTallyBook`: каждый бюллетень прибавляется к сумме ElGamal, а счётчики вариантов HappyVote публикует только после одной транзакции `publish` в дату публикации. В Testnet эти транзакции приватного автора платит канонический Sponsored FPC. `AuthorFeeSponsor` — плательщик для Mainnet в этом исходнике, он не развёрнут.

В **Earlier networks** остаются Testnet 5.1.0 [`0x2e10858cf6750c003489a62f570535966fb940bb10d18a0c146a36cac64713b6`](https://testnet.aztecscan.xyz/address/0x2e10858cf6750c003489a62f570535966fb940bb10d18a0c146a36cac64713b6) и более ранний контракт Testnet 6.0.0 [`0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14`](https://testnet.aztecscan.xyz/address/0x20053869edad8edf92f0b7144bfc6344e0534866f26b0f330cee87431ebd9e14). Контракт от 4 ноября `0x08cc6d5b022900717c01af9b2800a83177aeab263cfd920416b33b56f6bc5881` в этом архиве больше нет. Это развёртывание не архивирует `0x2ee5a78e59b3f79d175d32f777ad1fbc221fffa868f7feddc707809770da00f1` и `0x12b946b72a45a75719bd4af4f1697d99e02acf45d79876b8cbce1df115783fb0`. Строки архива не открывают `/p/:id`. Опросы 1–4 на адресе выше начинаются с нуля.

## Env фронтенда

```
VITE_AZTEC_NODE_URL=https://aztec-testnet.drpc.org
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=0x00e30a477cfd54d6a5d8372ab955b5e5197099164f11f9bb5b192c5892b96bf3
VITE_HIDDEN_AUTHOR_BOOK_ADDRESS=0x02c54586f55c07ea3faaf5f764cb86fb4d2e696b0b9ce9d81fbe5dc7f7703d29
VITE_SEALED_TALLY_BOOK_ADDRESS=0x0be7a7a9372daf7303e4545ebc3e62273a4a4ba039ea4fa9e9a10b626ef1237d
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
```
