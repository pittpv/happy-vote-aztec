Vendored from `aztec compile` / codegen. Refresh after contract changes:

```bash
# WSL, from aztec/
aztec compile && aztec codegen target --outdir src/artifacts
cp src/artifacts/HappyVote.ts web/src/contracts/HappyVote.ts
cp target/happy_vote_aztec-HappyVote.json web/src/contracts/happy_vote_aztec-HappyVote.json
# then fix the JSON import path in HappyVote.ts to ./happy_vote_aztec-HappyVote.json
```
