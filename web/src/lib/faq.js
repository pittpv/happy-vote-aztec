/**
 * Public FAQ, highest-priority questions first.
 * Answers match the live product: private hides the address, tallies stay public unless sealed.
 */
export const FAQ_ITEMS = [
  {
    id: "what",
    question: "What is HappyVote on Aztec?",
    answer:
      "HappyVote is a technology layer for polls on Aztec Network. You cast a private or open ballot, and the tally is public unless the poll is sealed until it closes. It is not an election authority, a government, or a certified election system.",
  },
  {
    id: "private",
    question: "Is my vote private?",
    answer:
      "Private is the default when the poll allows a choice. A private ballot hides your Aztec address. The option you chose still adds to the public tally, so anyone can see how many votes each option has. An open ballot publishes your address together with your selection.",
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
      "Open a poll, complete ZKPassport if that poll asks for it, connect an Aztec wallet, pick one option, then choose Private or Open and submit. Proving the ballot can take a few minutes. You can read results without connecting.",
  },
  {
    id: "wallet",
    question: "Which wallet should I use?",
    answer:
      "Browser session is always offered. It is an in-page account for this browser, with a new address each time you connect. Installed wallets that speak this network are listed by name. To keep an account, use Nulo Wallet (https://nulo.sh/).",
  },
  {
    id: "fee",
    question: "Do I pay a fee to vote?",
    answer:
      "On Testnet, the ballot fee is covered by the Sponsored FPC when that sponsorship is available. HappyVote does not charge a separate product fee to cast a ballot. Sponsorship can be unavailable, and a later Mainnet deployment would use that network’s fee mechanism.",
  },
  {
    id: "zkpassport",
    question: "Why does a poll ask for ZKPassport?",
    answer:
      "Some polls need one person, one vote. ZKPassport checks personhood on your device and produces a proof. HappyVote does not receive a passport image. For those polls the proof is checked again on the server before the ballot is tied to an identity commitment. Open polls do not ask for this.",
  },
  {
    id: "twice",
    question: "Can I vote more than once?",
    answer:
      "The contract rejects a second ballot from the same account for that poll, or for that UTC day when the poll is daily. Private and open share that limit. A ZKPassport poll also binds the person, so another account does not add a second ballot for the same proof. A note in this browser is only a hint; it does not store your address.",
  },
  {
    id: "sealed",
    question: "What is a sealed poll?",
    answer:
      "While voting is open, option counts and the total stay hidden. Option buttons show labels only. When the poll ends, is cancelled, or reaches its end time, the tally becomes readable.",
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
    id: "earlier",
    question: "What happens to polls from an earlier Aztec network?",
    answer:
      "A new Aztec network does not keep the previous contract state. While an older network can still be read, HappyVote stores a snapshot of those titles and tallies. After that, All polls shows the snapshot. If neither the old network nor a snapshot is available, that section is left off the page. Those rows are not open for new votes.",
  },
];
