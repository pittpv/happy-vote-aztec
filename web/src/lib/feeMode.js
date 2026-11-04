/** Ballot fee mode stored on a user poll. Missing mode is an operator poll: Sponsored FPC. */

export const FEE_MODE = {
  SPONSORED: "sponsored",
  VOTER: "voter",
  POOL: "pool",
};

export const FEE_FALLBACK = {
  STOP: "stop",
  VOTER: "voter",
};

export function hasExplicitFeeMode(poll) {
  return (
    poll?.feeMode === FEE_MODE.SPONSORED ||
    poll?.feeMode === FEE_MODE.VOTER ||
    poll?.feeMode === FEE_MODE.POOL
  );
}

export function feeFallbackOf(poll) {
  return poll?.feeFallback === FEE_FALLBACK.VOTER ? FEE_FALLBACK.VOTER : FEE_FALLBACK.STOP;
}

/**
 * Guest-visible sentence. Operator polls keep the Testnet sponsored sentence.
 * @param {object} poll
 * @param {{ poolRemaining?: number }} [extra]
 */
export function ballotFeeCopy(poll, extra = {}) {
  if (!hasExplicitFeeMode(poll)) {
    return "On Testnet, the ballot fee is covered by the Sponsored FPC. HappyVote does not charge a separate fee to vote.";
  }
  if (poll.feeMode === FEE_MODE.VOTER) {
    return "This poll’s network fee is paid with your account’s Fee Juice. HappyVote does not add a second charge.";
  }
  if (poll.feeMode === FEE_MODE.POOL) {
    const left = extra.poolRemaining;
    const count =
      typeof left === "number"
        ? ` ${left} sponsored ballot${left === 1 ? "" : "s"} left in the pool.`
        : "";
    const fallback =
      feeFallbackOf(poll) === FEE_FALLBACK.VOTER
        ? " If the pool cannot cover the fee cap, you can confirm and pay with your Fee Juice."
        : " If the pool cannot cover the fee cap, Vote stays closed.";
    return `This poll covers the network fee from its pool.${count}${fallback}`;
  }
  const fallback =
    feeFallbackOf(poll) === FEE_FALLBACK.VOTER
      ? " If the sponsor rejects the transaction, you can confirm and pay with your Fee Juice."
      : " If the sponsor rejects the transaction, Vote stays closed.";
  return `The network fee is covered by the Sponsored FPC.${fallback} HappyVote does not add a second charge.`;
}
