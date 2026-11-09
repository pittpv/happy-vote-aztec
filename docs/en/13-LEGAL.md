# 13 — Legal

In-app documents (English UI). Effective **9 November 2026**. Contact: **legal@happyvote.xyz**.

These are working texts that match current product behaviour. They are not a substitute for counsel review.

| Document | URL |
|----------|-----|
| Terms of Service | https://aztec.happyvote.xyz/legal/terms |
| Privacy Policy | https://aztec.happyvote.xyz/legal/privacy |
| Data Safety | https://aztec.happyvote.xyz/legal/data-safety |
| Cookie Policy | https://aztec.happyvote.xyz/legal/cookies |
| GDPR | https://aztec.happyvote.xyz/legal/gdpr |

Source: `web/src/lib/legalDocs.js`, rendered by the legal page component.

## What the texts cover

- **Terms** — Testnet demo, not an official election; Aztec wallet; Ethereum wallet sign-in, where the signature is the account key and is not sent to HappyVote; private vs open ballots; ZKPassport as a third party; no custody of keys or passports.
- **Privacy** — on-chain public state vs private ballots; the Ethereum address is seen in the page during that sign-in and is not sent to the HappyVote server; guest tally API; catalog metadata; hosting logs; first-party cookieless visit aggregates; independent controllers (Aztec Labs RPC, ZKPassport, wallets, explorers).
- **Data Safety** — no passport images; proofs re-verified then discarded from the application path; keys stay in the browser / PXE. An Ethereum account key is encrypted in this browser’s IndexedDB until site data is cleared.
- **Cookies** — first-party functional storage (`localStorage` catalog, short-lived ZKPassport id, participation hint without a wallet address, `sessionStorage` catalog signing key until the listing is published or dismissed, encrypted IndexedDB record `happyvote-ethereum-account-v1`); no first-party analytics cookies. Hosting, fonts, wallets, and ZKPassport may set their own storage.
- **GDPR** — roles, lawful bases, transfers, rights, contact.

Cookie Policy, Privacy Policy, and GDPR state that this subdomain does not run a third-party analytics counter. Visit totals are first-party, cookieless, and aggregated.
