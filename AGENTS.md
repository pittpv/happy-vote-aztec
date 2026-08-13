# Aztec Project (happy-vote-aztec)

## Critical: Use the `aztec` CLI, not `nargo` or `bb` directly

- **Compile**: `aztec compile` (NOT `nargo compile`)
- **Test**: `aztec test` (NOT `nargo test`)
- **Prove**: NEVER call `bb` directly
- Prefer `aztec-nargo fmt` / `aztec-nargo doc` over bare `nargo`

## Version

Pin Aztec.nr + `@aztec/*` to **5.1.0** (matches Testnet/Alpha). See https://docs.aztec.network/networks

## Hashing

Default to Poseidon2 for application hashes in Aztec.nr.

## Error Handling

- Never swallow errors or use `AztecAddress.ZERO` / null fallbacks to hide missing data
- Prefer throwing over silent defaults

## HappyVote specifics

- Contract: `src/main.nr` (`HappyVote`)
- Never edit `src/artifacts/HappyVote.ts` — regenerate with `yarn codegen`
- Product docs: `docs/en/` and `docs/ru/` (English is primary for this public repo)
- Do not document a web Admin path or operator UI in public docs
