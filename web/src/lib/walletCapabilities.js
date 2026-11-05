import { ProtocolContractAddress } from "@aztec-labs/protocol-contracts";
import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/auth-registry/constants";
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/handshake-registry/constants";
import { STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS } from "@aztec-labs/standard-contracts/multi-call-entrypoint/constants";
import {
  authorFeeSponsorAddress,
  getContractAddress,
  getSponsoredFpcAddress,
  hiddenAuthorBookAddress,
} from "./aztecClient.js";

/**
 * Capability grant requested from a connected wallet.
 * Must include every contract we later registerContract() — Sponsored FPC, HappyVote,
 * and standard contracts used by SingleUseClaim / account entrypoints.
 *
 * Some wallets check every call in sendTx against transaction.scope, including the
 * Sponsored FPC fee-payment call. Registering the FPC under type:"contracts" is not enough.
 */
export function happyVoteCapabilities() {
  const feeJuice = ProtocolContractAddress.FeeJuice;
  const sponsoredFpc = getSponsoredFpcAddress();
  const happyVote = getContractAddress();

  const contracts = [
    feeJuice,
    sponsoredFpc,
    STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
    STANDARD_AUTH_REGISTRY_ADDRESS,
    STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS,
  ];
  if (happyVote) contracts.push(happyVote);
  const book = hiddenAuthorBookAddress();
  const authorSponsor = authorFeeSponsorAddress();
  if (book) contracts.push(book.toString());
  if (authorSponsor) contracts.push(authorSponsor.toString());

  const feeTxScope = [
    { contract: sponsoredFpc, function: "sponsor_unconditionally" },
    { contract: feeJuice, function: "check_balance" },
  ];

  const happyVoteTxScope = happyVote
    ? [
        { contract: happyVote, function: "cast_vote_private" },
        { contract: happyVote, function: "cast_vote_open" },
        { contract: happyVote, function: "create_poll" },
        { contract: happyVote, function: "end_poll" },
        { contract: happyVote, function: "cancel_poll" },
        { contract: happyVote, function: "set_paused" },
        { contract: happyVote, function: "get_paused" },
        { contract: happyVote, function: "transfer_admin" },
        { contract: happyVote, function: "get_next_poll_id" },
        { contract: happyVote, function: "get_tally" },
        { contract: happyVote, function: "get_total_votes" },
        { contract: happyVote, function: "get_privacy_policy" },
        { contract: happyVote, function: "get_admin" },
        { contract: happyVote, function: "get_sealed" },
        { contract: happyVote, function: "get_starts_at" },
        { contract: happyVote, function: "get_ends_at" },
        { contract: happyVote, function: "get_cancelled" },
        { contract: happyVote, function: "get_vote_frequency" },
        { contract: happyVote, function: "get_current_vote_period" },
        { contract: happyVote, function: "create_user_poll" },
        { contract: happyVote, function: "fund_pool" },
        { contract: happyVote, function: "quote_pool" },
        { contract: happyVote, function: "commit_pool_ballot" },
        { contract: happyVote, function: "set_pool_payer" },
        { contract: happyVote, function: "set_allow_sponsored" },
        { contract: happyVote, function: "set_authoritative" },
        { contract: happyVote, function: "is_authoritative" },
        { contract: happyVote, function: "get_creator" },
        { contract: happyVote, function: "get_fee_mode" },
        { contract: happyVote, function: "get_pool_remaining" },
        { contract: happyVote, function: "get_pool_juice" },
        { contract: happyVote, function: "get_pool_refunded" },
        { contract: happyVote, function: "get_signing_pubkey_x" },
      ]
    : [];

  const hiddenScope = book && happyVote
    ? [
        { contract: book.toString(), function: "create_user_poll_private" },
        { contract: book.toString(), function: "end_hidden_poll" },
        { contract: book.toString(), function: "get_hidden_author_note" },
        { contract: happyVote, function: "init_hidden_user_poll" },
        { contract: happyVote, function: "finish_hidden_poll" },
        { contract: happyVote, function: "set_hidden_author_book" },
      ]
    : [];
  const authorSponsorScope = authorSponsor
    ? [{ contract: authorSponsor.toString(), function: "sponsor_unconditionally" }]
    : [];

  const txScope = [...happyVoteTxScope, ...hiddenScope, ...feeTxScope, ...authorSponsorScope];

  return {
    version: "1.0",
    metadata: {
      name: "HappyVote on Aztec",
      version: "0.1.0",
      description: "Private and open ballots on Aztec Network",
      url: typeof window !== "undefined" ? window.location.origin : "https://aztec.happyvote.xyz",
    },
    capabilities: [
      { type: "accounts", canGet: true, canCreateAuthWit: false },
      {
        type: "contracts",
        contracts,
        canRegister: true,
        canGetMetadata: true,
      },
      {
        type: "simulation",
        utilities: { scope: [] },
        transactions: {
          scope: txScope,
        },
      },
      {
        type: "transaction",
        scope: txScope,
      },
    ],
  };
}
