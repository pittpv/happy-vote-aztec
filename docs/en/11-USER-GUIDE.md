# 11 — User guide (Testnet)

Production: **https://aztec.happyvote.xyz**  
UI notes: [12-UI-UX.md](./12-UI-UX.md)

## Home

1. Open https://aztec.happyvote.xyz.
2. Read the short mission / privacy pillars (optional).
3. Under **Featured polls**, open a card, or go to **All polls** (`/polls`). The page has two sections, **Авторитетные голосования** and **Users polls**. Each section has **Active** and **Ended**. Ended polls that are not on the homepage appear 24 at a time. Search and filters (topic, country, eligibility) apply to both. Country includes ZKPassport Dashboard policy countries when the poll uses a `policyId`.

The header menu (desktop and mobile) has Home, All polls, Create, FAQ, and wallet connect / connected address.

## Create a poll

Open **Create** (`/create`) and connect a browser session. The form stays hidden until that session is connected. It publishes one single-choice poll with 2–32 options. Each option has a label and an optional short description. Privacy is voter choice, private only, or open only. Frequency is once per account or once per UTC day. The tally can stay sealed until close. Eligibility is any account, or ZKPassport personhood. Set an end time. The window is at most 90 days. One account can create one poll per UTC day and keep at most three polls open. Homepage placement is chosen by HappyVote. The ballot fee is Sponsored FPC on Testnet, the voter’s Fee Juice, or a poll pool. Create publishes that poll on the current Testnet contract.

Footer: author links (X, LinkedIn, GitHub) and legal pages (Terms, Privacy, Data Safety, Cookies, GDPR).

## Without a wallet

- Browse featured polls on home, or the full catalog at `/polls` (**Active** and **Ended**), then open any poll
- See **start/end times** and a live countdown when a poll is scheduled
- View **Live results** (public tallies; hidden while a poll is sealed and still open — option buttons show labels only, no zeros)
- If the contract is paused or a poll is cancelled, the ballot stays locked; the question remains readable
- Share a deep link: `/p/1` (Happy/Sad), `/p/2` (single-choice), `/p/3` (ZKPassport demo), `/p/4` (sealed tallies). Ballots from the previous Testnet contract, including its fifth poll, are listed under **Earlier networks** and do not open `/p/:id`.
- Read the contract on [Aztecscan](https://testnet.aztecscan.xyz)

## Vote (private or open)

1. Open a poll from home or https://aztec.happyvote.xyz/polls (for example https://aztec.happyvote.xyz/p/1).
2. If the poll is scheduled, wait for the countdown: Connect and Vote stay locked until the start time, then a countdown to the end runs while voting is open. The same lock applies if voting is paused or the poll is cancelled.
3. Progress chips: **Ready/Verify → Connect → Vote**. A finished step turns green. **Vote** turns green after this browser records a ballot, and on a daily poll it returns to the current step the next UTC day.
4. If the poll requires ZKPassport, complete verification first (QR on desktop, ZKPassport app on the phone). After success the block collapses to **Identity verified**.
5. Click **Connect Aztec wallet**.
   - **Browser session** is always listed. It creates an initializerless Schnorr account in this tab — no on-chain account-deploy tx. Proving the ballot itself can still take several minutes. Each new Browser session is a **new Aztec address**.
   - If an installed wallet is not listed, approve HappyVote in its popup. Its name then appears in this window. Several can be installed at once; pick one. HappyVote connects only that wallet. On Testnet the ballot fee is covered by the Sponsored FPC — you do not need Fee Juice for the vote itself.
   - When a wallet connects, compare the emoji grid with the wallet, then confirm in the wallet. HappyVote closes once the wallet accepts.
6. Under **Your ballot** pick an option. Under **Ballot privacy** choose **Private** (default) or **Open**.
7. Submit and wait for the proof. The wallet proves the ballot once; the page then waits until it is in a proposed L2 block. Proving can still take several minutes. The button names the step in progress and shows bouncing dots until it finishes. The step text, result, or error appears directly under the button; use **Open tx** when shown. Opening another poll with the same connected wallet does not set the wallet up again.
8. Expand **Fees on testnet** to read that the network fee is covered by the Sponsored FPC.
9. Expand **How to vote** for the short checklist.

On wide screens, **Live results** sit beside the ballot; on mobile they stack below.

## Earlier networks

All polls has a section **Earlier networks** after Ended only when a previous network still answers or a saved snapshot exists. If neither is available, the section is omitted. While the old network can still be read, the API stores a snapshot and later shows that snapshot. Voting on this site uses the current network only. Each network name opens to a contract address, then the poll titles and results. A sealed poll on a previous network stays hidden until that poll is closed.

## Rules

- **One vote per Aztec account per poll**, or **one vote per UTC day** when the poll is created with daily frequency. Private and open share that limit. A new Browser session is a new account, so open-eligibility polls can be voted again after reconnecting. That is expected for fun polls (`/p/1`, `/p/2`, `/p/4`). Personhood/gated polls (`/p/3`) also bind **one ZKPassport identity**, so extra session addresses do not add extra ballots. After a ballot, this browser may show a **device hint** (no address stored). It does not lock the Vote button; sending again with the **same account** still fails on-chain.
- Daily polls reset at **00:00 UTC**. Each new day adds to the tally; the previous choice is not removed.
- Private mode hides your **address**; the chosen option still increments the **public** tally (unless the poll is sealed).
- Open mode publishes address + choice.
- Important polls may also bind **one ZKPassport identity per poll** (or per UTC day on daily polls).
- Guest tallies come from same-origin `/api/poll-state`.

## ZKPassport

Used when a poll requires personhood or extra gates. HappyVote does not receive passport document data. Production uses `@zkpassport/sdk` when `VITE_ZKPASSPORT_ENABLED=true` for domain `aztec.happyvote.xyz`. See [04-ZKPASSPORT.md](./04-ZKPASSPORT.md).
