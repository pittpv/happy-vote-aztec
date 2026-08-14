/** Optional catalog voting window. Omit both dates → poll stays open until on-chain end. */

export const POLL_PHASE = {
  ALWAYS: "always",
  UPCOMING: "upcoming",
  OPEN: "open",
  CLOSED: "closed",
};

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function parsePollInstant(value) {
  if (value == null || String(value).trim() === "") return null;
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return ms;
}

/**
 * @param {{ startsAt?: unknown, endsAt?: unknown }} input
 * @returns {{ startsAt: string | null, endsAt: string | null }}
 */
export function normalizePollWindow(input = {}) {
  const startMs = parsePollInstant(input.startsAt);
  const endMs = parsePollInstant(input.endsAt);
  if (startMs != null && endMs != null && endMs <= startMs) {
    throw new Error("End must be after start");
  }
  return {
    startsAt: startMs == null ? null : new Date(startMs).toISOString(),
    endsAt: endMs == null ? null : new Date(endMs).toISOString(),
  };
}

/**
 * @param {unknown} meta
 * @param {number} [now]
 */
export function getPollSchedule(meta, now = Date.now()) {
  let startMs = null;
  let endMs = null;
  try {
    startMs = parsePollInstant(meta?.startsAt);
    endMs = parsePollInstant(meta?.endsAt);
  } catch {
    startMs = null;
    endMs = null;
  }

  const hasStart = startMs != null;
  const hasEnd = endMs != null;

  let phase = POLL_PHASE.ALWAYS;
  if (!hasStart && !hasEnd) {
    phase = POLL_PHASE.ALWAYS;
  } else if (hasStart && now < startMs) {
    phase = POLL_PHASE.UPCOMING;
  } else if (hasEnd && now >= endMs) {
    phase = POLL_PHASE.CLOSED;
  } else {
    phase = POLL_PHASE.OPEN;
  }

  let remainingMs = null;
  if (phase === POLL_PHASE.UPCOMING) remainingMs = Math.max(0, startMs - now);
  else if (phase === POLL_PHASE.OPEN && hasEnd) remainingMs = Math.max(0, endMs - now);

  return {
    phase,
    startsAt: hasStart ? startMs : null,
    endsAt: hasEnd ? endMs : null,
    remainingMs,
  };
}

export function isVotingOpen(schedule, voteEnded = false) {
  if (voteEnded) return false;
  return schedule.phase === POLL_PHASE.ALWAYS || schedule.phase === POLL_PHASE.OPEN;
}

export function assertVotingOpen(meta, now = Date.now()) {
  const schedule = getPollSchedule(meta, now);
  if (schedule.phase === POLL_PHASE.UPCOMING) {
    throw new Error("This poll has not started yet");
  }
  if (schedule.phase === POLL_PHASE.CLOSED) {
    throw new Error("This poll has ended");
  }
}

export function formatCountdown(ms) {
  if (ms == null || ms <= 0) return "0s";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatPollDateTime(msOrIso) {
  if (msOrIso == null || msOrIso === "") return "";
  const date = typeof msOrIso === "number" ? new Date(msOrIso) : new Date(msOrIso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** `datetime-local` value from ISO, in the operator's local timezone. */
export function isoToDatetimeLocal(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Empty → null. Local `datetime-local` string → UTC ISO. */
export function datetimeLocalToIso(value) {
  if (value == null || String(value).trim() === "") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid datetime");
  }
  return date.toISOString();
}

/** ISO or empty → unix seconds for the contract (`0` = unset). */
export function isoToUnixSeconds(iso) {
  if (iso == null || iso === "") return 0;
  const ms = Date.parse(String(iso));
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid datetime: ${iso}`);
  }
  return Math.floor(ms / 1000);
}

/** On-chain unix seconds (`0`/unset) → ISO, else `null`. */
export function unixSecondsToIso(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

export function scheduleBadge(schedule, voteEnded = false) {
  if (voteEnded || schedule.phase === POLL_PHASE.CLOSED) {
    return { label: "Ended", kind: "ended" };
  }
  if (schedule.phase === POLL_PHASE.UPCOMING) {
    return { label: "Upcoming", kind: "soon" };
  }
  if (schedule.phase === POLL_PHASE.OPEN && schedule.endsAt != null) {
    return { label: "Live", kind: "live" };
  }
  return null;
}

export function scheduleSummary(schedule, voteEnded = false) {
  if (voteEnded || schedule.phase === POLL_PHASE.CLOSED) {
    const when = schedule.endsAt ? formatPollDateTime(schedule.endsAt) : "";
    return when ? `Ended ${when}` : "Ended";
  }
  if (schedule.phase === POLL_PHASE.UPCOMING) {
    return `Starts in ${formatCountdown(schedule.remainingMs)}`;
  }
  if (schedule.phase === POLL_PHASE.OPEN && schedule.endsAt != null) {
    return `Ends in ${formatCountdown(schedule.remainingMs)}`;
  }
  return null;
}
