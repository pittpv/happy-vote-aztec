# 11 — User guide (Testnet)

Production: **https://aztec.happyvote.xyz**  
UI notes: [12-UI-UX.md](./12-UI-UX.md)

## Home

1. Open https://aztec.happyvote.xyz.
2. Read the short mission / privacy pillars (optional).
3. Under **Open polls**, search or filter, then open a card.

Footer: author links (X, LinkedIn, GitHub) and legal pages (Terms, Privacy, Data Safety, Cookies, GDPR).

## Without a wallet

- Browse the catalog and open any poll
- See **start/end times** and a live countdown when a poll is scheduled
- View **Live results** (public tallies; hidden while a poll is sealed and still open)
- If the contract is paused or a poll is cancelled, the ballot stays locked; the question remains readable
- Share a deep link: `/p/1` (Happy/Sad), `/p/2` (single-choice), `/p/3` (ZKPassport demo)
- Read the contract on [Aztecscan](https://testnet.aztecscan.xyz)

## Vote (private or open)

1. Open a poll from the home catalog (for example https://aztec.happyvote.xyz/p/1).
2. If the poll is scheduled, wait for the countdown: Connect and Vote stay locked until the start time, then a countdown to the end runs while voting is open. The same lock applies if voting is paused or the poll is cancelled.
3. Progress chips: **Ready/Verify → Connect → Vote**.
4. If the poll requires ZKPassport, complete verification first (QR on desktop, ZKPassport app on the phone). After success the block collapses to **Identity verified**.
5. Click **Connect Aztec wallet**.
   - Prefer **Browser session** for voting (in-page PXE). The first prove can take several minutes.
   - [Azguard](https://azguardwallet.io/) / Aztec Demo Wallet can connect; some calls may still need Browser session.
6. Under **Your ballot** pick an option. Under **Ballot privacy** choose **Private** (default) or **Open**.
7. Submit and wait for proving + inclusion. Status sits next to the CTA; use **Open tx** when shown.
8. Expand **Fees on testnet** only if a fee error appears — claim Fee Juice at https://aztec-faucet.nethermind.io and paste your Aztec address.
9. Expand **How to vote** for the short checklist.

On wide screens, **Live results** sit beside the ballot; on mobile they stack below.

## Rules

- **One vote per Aztec account per poll** (nullifier / `SingleUseClaim`).
- Private mode hides your **address**; the chosen option still increments the **public** tally (unless the poll is sealed).
- Open mode publishes address + choice.
- Important polls may also bind **one ZKPassport identity per poll**.
- Guest tallies come from same-origin `/api/poll-state`.

## ZKPassport

Used when a poll requires personhood or extra gates. HappyVote does not receive passport document data. Production uses `@zkpassport/sdk` when `VITE_ZKPASSPORT_ENABLED=true` for domain `aztec.happyvote.xyz`. See [04-ZKPASSPORT.md](./04-ZKPASSPORT.md).
