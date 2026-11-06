import { scheduleEnded } from "./pollSchedule.js";

/**
 * All polls lanes. Operator polls and authoritative creators stay in the first lane.
 * Other account polls stay in the second. Open polls stay in each lane.
 * Ended is one shared list after both lanes.
 */

export function isAccountPoll(poll) {
  return poll?.publisher === "account";
}

/**
 * Homepage placement is curated. An account poll is featured only when the
 * flag was set explicitly. The creator's publish path never sets that flag.
 * Operator polls stay featured when the field is absent, matching the live catalog.
 */
export function curatedHomeFlag(poll) {
  if (isAccountPoll(poll)) return poll?.showOnHome === true;
  return poll?.showOnHome !== false;
}

/** Republishing a user poll keeps the admin's homepage choice and cannot change it. */
export function accountHomeFlag(previous) {
  return previous?.showOnHome === true;
}

/**
 * Admin-created polls (no account publisher) and polls whose creator was marked authoritative.
 * A missing publisher is an operator poll from the current catalog.
 */
export function isAuthoritativePoll(poll) {
  if (!isAccountPoll(poll)) return true;
  return Boolean(poll.creatorAuthoritative);
}

/** Operator polls stay ahead of marked-account polls inside the first section. */
export function orderAuthoritative(polls, mode) {
  const operators = [];
  const marked = [];
  for (const poll of polls || []) {
    if (isAccountPoll(poll)) marked.push(poll);
    else operators.push(poll);
  }
  return [...sortPolls(operators, mode), ...sortPolls(marked, mode)];
}

/**
 * Live catalog is every poll that can still be open, plus featured polls.
 * The ended archive is everything else. Hidden polls are omitted from both.
 */
export function partitionCatalogWindow(polls, now = Date.now()) {
  const live = [];
  const ended = [];
  for (const poll of polls || []) {
    if (poll?.hidden) continue;
    if (!scheduleEnded(poll, now) || curatedHomeFlag(poll)) live.push(poll);
    else ended.push(poll);
  }
  return { live, ended };
}

export function splitAuthority(polls) {
  const authoritative = [];
  const users = [];
  for (const poll of polls || []) {
    if (poll?.hidden) continue;
    if (isAuthoritativePoll(poll)) authoritative.push(poll);
    else users.push(poll);
  }
  return { authoritative, users };
}

function publishedTime(poll) {
  const ms = Date.parse(poll?.publishedAt || "");
  return Number.isFinite(ms) ? ms : Number(poll?.id) || 0;
}

function endTime(poll) {
  const ms = Date.parse(poll?.endsAt || "");
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/** `id` keeps today's order. `newest` and `ending` are the Iteration 2 sorts. */
export function sortPolls(polls, mode) {
  const copy = [...(polls || [])];
  if (mode === "newest") {
    copy.sort((a, b) => publishedTime(b) - publishedTime(a) || Number(a.id) - Number(b.id));
  } else if (mode === "ending") {
    copy.sort((a, b) => endTime(a) - endTime(b) || Number(a.id) - Number(b.id));
  } else {
    copy.sort((a, b) => Number(a.id) - Number(b.id));
  }
  return copy;
}
