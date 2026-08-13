import { ProtocolContractAddress } from "@aztec/protocol-contracts";
import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec/standard-contracts/auth-registry/constants";
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from "@aztec/standard-contracts/handshake-registry/constants";
import { STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS } from "@aztec/standard-contracts/multi-call-entrypoint/constants";
import { getContractAddress, getSponsoredFpcAddress } from "./aztecClient.js";

/**
 * Capability grant requested from Azguard / Demo Wallet (same pattern as the faucet).
 * Must include every contract we later registerContract() — Sponsored FPC, HappyVote,
 * and standard contracts used by SingleUseClaim / account entrypoints.
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

  const happyVoteTxScope = happyVote
    ? [
        { contract: happyVote, function: "cast_vote_private" },
        { contract: happyVote, function: "cast_vote_open" },
        { contract: happyVote, function: "create_poll" },
        { contract: happyVote, function: "get_tally" },
        { contract: happyVote, function: "get_total_votes" },
        { contract: happyVote, function: "get_privacy_policy" },
        { contract: happyVote, function: "get_admin" },
      ]
    : [];

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
          scope: [
            ...happyVoteTxScope,
            { contract: feeJuice, function: "check_balance" },
          ],
        },
      },
      {
        type: "transaction",
        scope: [
          ...happyVoteTxScope,
          { contract: feeJuice, function: "check_balance" },
        ],
      },
    ],
  };
}
