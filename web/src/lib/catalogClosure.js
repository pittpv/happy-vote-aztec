import { getPollSchedule, POLL_PHASE } from "./pollSchedule.js";

/**
 * On-chain closed flags for the catalog (`GET /api/poll-state?catalog=1`).
 * @returns {Promise<Record<string, { closed: boolean }>>}
 */
export async function fetchCatalogClosures() {
  const response = await fetch("/api/poll-state?catalog=1");
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Poll status HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!data?.polls || typeof data.polls !== "object") {
    throw new Error("Invalid poll status response");
  }
  return data.polls;
}

/**
 * `true` ended, `false` still open, `null` when this poll has no chain status yet.
 * @param {Record<string, { closed?: boolean }> | null} closures
 * @param {{ id: string, endsAt?: unknown, startsAt?: unknown }} poll
 * @param {number} now
 */
export function cardClosedFlag(closures, poll, now) {
  if (getPollSchedule(poll, now).phase === POLL_PHASE.CLOSED) return true;
  const row = closures?.[String(poll.id)];
  if (!row || typeof row.closed !== "boolean") return null;
  return row.closed;
}

/**
 * @param {object[]} polls
 * @param {number} now
 * @param {Record<string, { closed?: boolean }>} closures
 */
export function partitionPolls(polls, now, closures) {
  const active = [];
  const ended = [];
  const unknown = [];
  for (const poll of polls) {
    const closed = cardClosedFlag(closures, poll, now);
    if (closed === true) ended.push(poll);
    else if (closed === false) active.push(poll);
    else unknown.push(poll);
  }
  return { active, ended, unknown };
}
