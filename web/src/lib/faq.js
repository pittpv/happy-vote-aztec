/**
 * Public FAQ. Groups follow the audience. Items inside a group are highest priority first.
 * Answers match the live product: private hides the address, tallies stay public unless sealed.
 */
export const FAQ_GROUPS = [
  {
    id: "voters",
    title: "For voters",
    lede: "Privacy, how a ballot is counted, and what you need before you vote.",
    items: [
      {
        id: "private",
        question: "Is my vote private?",
        answer:
          "Private is the default when the poll allows a choice. A private ballot hides your Aztec address. The option you chose still adds to the public tally, so anyone can see how many votes each option has. An open ballot publishes your address together with your selection. Some polls allow only one of those modes.",
      },
      {
        id: "results",
        question: "Who can see the results?",
        answer:
          "Guests can read the tally without a wallet. Counts come from the contract, not from a private HappyVote database. A sealed poll hides those counts until voting closes. After the poll ends, is cancelled, or passes its end time, the numbers can be read.",
      },
      {
        id: "how",
        question: "How do I vote?",
        answer:
          "Open a poll, complete ZKPassport if that poll asks for it, connect an Aztec wallet, pick one option, then choose Private or Open and submit. Proving the ballot can take a few minutes. You can read results without connecting. The poll page states the network fee before you connect.",
      },
      {
        id: "twice",
        question: "Can I vote more than once?",
        answer:
          "The contract rejects a second ballot from the same account for that poll, or for that UTC day when the poll is once every 24 hours. Private and open share that limit. A ZKPassport poll also binds the person, so another account does not add a second ballot for the same proof. A note in this browser is only a hint; it does not store your address.",
      },
      {
        id: "fee",
        question: "Do I pay a fee to vote?",
        answer:
          "HappyVote does not add its own charge on the Vote button. The poll sets the Aztec network fee, and the page states that mode before you connect.\n\nOn the polls HappyVote publishes, Testnet covers the ballot with the Sponsored FPC when that sponsorship is available. A poll someone else published can use the same sponsor, your account’s Fee Juice, or a pool attached to that poll. If the chosen payer cannot cover the fee, Vote stays closed, unless that poll’s fallback asks you to confirm and pay with Fee Juice.",
      },
      {
        id: "wallet",
        question: "Which wallet should I use?",
        answer:
          "Browser session is always offered. It is an in-page account for this browser, with a new address each time you connect. Installed wallets that speak this network are listed by name. To keep an account, use Nulo Wallet (https://nulo.sh/).",
      },
      {
        id: "zkpassport",
        question: "Why does a poll ask for ZKPassport?",
        answer:
          "Some polls need one person, one vote. ZKPassport checks personhood on your device and produces a proof. HappyVote does not receive a passport image. For those polls the proof is checked again on the server before the ballot is tied to an identity commitment. Open polls do not ask for this. Extra checks, such as age or nationality, are the ones signed with that poll.",
      },
      {
        id: "sealed",
        question: "What is a sealed poll?",
        answer:
          "While voting is open, option counts and the total stay hidden. Option buttons show labels only. When the poll ends, is cancelled, or reaches its end time, the tally becomes readable.",
      },
    ],
  },
  {
    id: "creators",
    title: "For creators",
    lede: "Publishing a poll from your own Aztec account, and closing it later.",
    items: [
      {
        id: "create",
        question: "Can I publish a poll?",
        answer:
          "Yes. Create in the header opens a public page. Connect Aztec wallet uses the same dialog as voting. Choose Public address to store the connected account as the author, or Private to leave the author off the poll. Private uses the deployed HiddenAuthorBook. On Testnet the Sponsored FPC pays the create and the early end. On Mainnet that payer is AuthorFeeSponsor, which is not deployed, so a Mainnet site keeps Private off. Paying from the author wallet would publish the address. A private ballot still hides a voter’s address, and the tally is public unless you seal it. Homepage placement is chosen by HappyVote.",
      },
      {
        id: "create-how",
        question: "How do I create a poll?",
        answer:
          "Connect, open the Create poll tab, and fill in the question. Then choose Create poll on-chain. Proving can take a few minutes. After the transaction is included, this same tab publishes the title and option labels to the catalog. Stay in the tab until that listing finishes, then the poll page opens.\n\nAn installed wallet keeps this author address after you reconnect. A browser session starts a new address each Connect, so polls from the previous session are not listed under the new one.",
      },
      {
        id: "rules",
        question: "What can I set on a new poll?",
        answer:
          "Title, an optional description, up to eight topics, and 2 to 32 options. Each option needs a label. A short description under the choice is optional.\n\nBallot privacy is voter choice, private only, or open only. Frequency is once per poll, or once every 24 hours (one ballot per UTC day). Private and open share that limit. You can seal the tally until the poll closes. End is required and must fall within 90 days. Start can stay empty: you may publish before voting opens, and Vote locks at the end. Eligibility is any Aztec account, or ZKPassport personhood with optional age, birthdate, nationality, document, sanctions, and facematch checks. Those checks are signed with the listing.",
      },
      {
        id: "listed",
        question: "Where does my poll appear?",
        answer:
          "After the listing is published, All polls shows it under User polls. Guests can open /p/:id without a wallet. It does not appear on the homepage unless HappyVote places it there. You do not set that placement. If HappyVote has marked your account authoritative, the poll can sit under Authoritative polls instead. Search, topic, country, and eligibility filters apply. After it ends, and it is not on the homepage, it stays in the shared Ended section.",
      },
      {
        id: "limits",
        question: "How many polls can I publish?",
        answer:
          "One account can create one public-author poll per UTC day, and one private-author poll per UTC day. A second create of the same kind that day is rejected. Each kind allows at most three polls that are still open. Ending a poll frees one of those three slots. After the end time, voting is already closed, and the slot stays taken until you end the poll.",
      },
      {
        id: "manage",
        question: "How do I manage a poll I created?",
        answer:
          "Open Create, then Your polls, with the wallet that published it. Public-author polls are every poll whose public author is that address, including ones past their end time. Private-author polls appear when this wallet still holds their secret. Open goes to the poll page. End poll closes voting from this wallet. Confirm end sends that transaction. Keep open leaves it running.\n\nA public author ends with that address. A private author ends with the secret in the wallet, and the sponsor contract pays that transaction. Cancel stays with HappyVote. When the end time has passed, voting is already closed. End the poll to release its open slot and return leftover pool funds.",
      },
      {
        id: "locked",
        question: "Can I change a poll after it is published?",
        answer:
          "The rules stored at create stay fixed: option count, privacy, frequency, eligibility, the sealed flag, the schedule, and the ballot fee. A different question is a new poll. Ending stops new ballots and leaves the tally that is already written.\n\nHappyVote can hide the card from All polls and the homepage. /p/:id still opens and says the listing was hidden.",
      },
      {
        id: "create-fee",
        question: "What do I pay to create a poll, and who pays each ballot?",
        answer:
          "On this Testnet site, the first poll an account creates in a UTC day can use the Sponsored FPC. That is separate from the ballot fee, which you choose on the form and which stays fixed.\n\nBallot fee is Sponsored FPC, the voter’s Fee Juice, or a poll pool. The vote page states the active mode before anyone votes. If that payer cannot cover the fee, Vote stays closed, unless you chose the fallback that asks the voter to pay Fee Juice. HappyVote does not add a second charge.",
      },
      {
        id: "listing",
        question: "Why is a poll on-chain but missing its title?",
        answer:
          "The chain stores the rules and a hash of the question. The title and labels are published from the browser tab that created the poll, with a one-time key from that transaction. If that step stops, Your polls shows the row as on-chain only and offers Publish listing while the key is still in this tab. Leave untitled keeps the poll without a public title. A listing whose signature or hash does not match is not shown.",
      },
    ],
  },
  {
    id: "general",
    title: "General",
    lede: "What this site is, and what happens when the network changes.",
    items: [
      {
        id: "what",
        question: "What is HappyVote on Aztec?",
        answer:
          "HappyVote is a technology layer for polls on Aztec Network. You cast a private or open ballot, and the tally is public unless the poll is sealed until it closes. It is not an election authority, a government, or a certified election system.",
      },
      {
        id: "official",
        question: "Is this an official election?",
        answer:
          "No. Results are artefacts of the Aztec contract you interact with. They are not a government count unless some separate arrangement says so. HappyVote can hide a listing later; it cannot erase a tally already written on the network.",
      },
      {
        id: "network",
        question: "Which network is this?",
        answer:
          "This site casts ballots on Aztec Testnet v6 (stable 6.0.0). Aztec Mainnet runs that same stable image. The vote page and the footer name the network this site is using. A HappyVote contract on Mainnet is a separate deployment.",
      },
      {
        id: "groups",
        question: "What is the difference between Authoritative polls and User polls?",
        answer:
          "All polls lists Authoritative polls first: polls published by HappyVote, then polls from accounts HappyVote has marked authoritative. User polls are the rest. Each of those sections has Active. Ended is one shared section after both. The homepage is a shorter curated list, not the full catalog.",
      },
      {
        id: "earlier",
        question: "What happens to polls from an earlier Aztec network?",
        answer:
          "A new Aztec network does not keep the previous contract state. While an older network can still be read, HappyVote stores a snapshot of those titles and tallies. After that, All polls shows the snapshot. If neither the old network nor a snapshot is available, that section is left off the page. Those rows are not open for new votes.",
      },
    ],
  },
];

export const FAQ_ITEMS = FAQ_GROUPS.flatMap((group) => group.items);
