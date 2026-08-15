/** On-chain `vote_frequency`: how often one account (and identity) may ballot. */

export const VOTE_FREQUENCY = {
  ONCE: 0,
  DAILY: 1,
};

export const SECONDS_PER_DAY = 86_400;

/**
 * UTC day index used as the on-chain claim period (`timestamp / 86400`).
 * @param {number} [nowMs]
 */
export function utcDayIndex(nowMs = Date.now()) {
  return Math.floor(Math.floor(nowMs / 1000) / SECONDS_PER_DAY);
}

/** Milliseconds until the next UTC midnight. */
export function msUntilNextUtcDay(nowMs = Date.now()) {
  const next = (utcDayIndex(nowMs) + 1) * SECONDS_PER_DAY * 1000;
  return Math.max(0, next - nowMs);
}

export function isDailyVote(frequency) {
  return Number(frequency) === VOTE_FREQUENCY.DAILY;
}

export function voteFrequencyLabel(frequency) {
  return isDailyVote(frequency) ? "Once per UTC day" : "One vote";
}
