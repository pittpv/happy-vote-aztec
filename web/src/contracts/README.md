Vendored from `aztec compile` / codegen. Refresh after contract changes.

`happy_vote_aztec-HappyVote.json` is the HappyVote artifact for the deployed Testnet contract. Replace it only together with that deployment.

`hidden_author_book-HiddenAuthorBook.json` is the private-author note contract. The create form uses it when `VITE_HIDDEN_AUTHOR_BOOK_ADDRESS` is set. `author_fee_sponsor-AuthorFeeSponsor.json` is the Mainnet fee payer. It is not deployed. Testnet private-author fees use the canonical Sponsored FPC.

```bash
# WSL, from aztec/
aztec compile && aztec codegen target --outdir src/artifacts
cp src/artifacts/HappyVote.ts web/src/contracts/HappyVote.ts
cp target/happy_vote_aztec-HappyVote.json web/src/contracts/happy_vote_aztec-HappyVote.json
# then fix the JSON import path in HappyVote.ts to ./happy_vote_aztec-HappyVote.json
```
