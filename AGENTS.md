# Aztec Project (happy-vote-aztec)

## Critical: Use the `aztec` CLI, not `nargo` or `bb` directly

- **Compile**: `aztec compile` (NOT `nargo compile`)
- **Test**: `aztec test` (NOT `nargo test`)
- **Prove**: NEVER call `bb` directly
- Prefer `aztec-nargo fmt` / `aztec-nargo doc` over bare `nargo`

## Version

Pin Aztec.nr and `@aztec-labs/*` to **Testnet 6.0.0-rc.3**. Alpha stays **5.2.0**. See https://docs.aztec.network/networks

## Hashing

Default to Poseidon2 for application hashes in Aztec.nr.

## Error Handling

- Never swallow errors or use `AztecAddress.ZERO` / null fallbacks to hide missing data
- Prefer throwing over silent defaults

## HappyVote specifics

- Contract: `src/main.nr` (`HappyVote`)
- Never edit `src/artifacts/HappyVote.ts` — regenerate with `yarn codegen`
- Product docs (bilingual): `../docs/aztec/en/` and `../docs/aztec/ru/`
- Root AI rules: `../AGENTS.md`
