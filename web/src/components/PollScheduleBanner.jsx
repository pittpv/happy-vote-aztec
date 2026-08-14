import {
  POLL_PHASE,
  formatCountdown,
  formatPollDateTime,
} from "../lib/pollSchedule.js";

export function PollScheduleBanner({ schedule, voteEnded = false }) {
  const closed = voteEnded || schedule.phase === POLL_PHASE.CLOSED;
  const startLabel = schedule.startsAt ? formatPollDateTime(schedule.startsAt) : null;
  const endLabel = schedule.endsAt ? formatPollDateTime(schedule.endsAt) : null;

  if (!closed && schedule.phase === POLL_PHASE.ALWAYS) return null;

  let headline;
  let tone = "neutral";
  if (closed) {
    headline = "Voting has ended";
    tone = "ended";
  } else if (schedule.phase === POLL_PHASE.UPCOMING) {
    headline = `Starts in ${formatCountdown(schedule.remainingMs)}`;
    tone = "soon";
  } else if (schedule.phase === POLL_PHASE.OPEN && schedule.endsAt != null) {
    headline = `Ends in ${formatCountdown(schedule.remainingMs)}`;
    tone = "live";
  } else {
    headline = "Voting is open";
    tone = "live";
  }

  return (
    <div className={`poll-schedule poll-schedule--${tone}`} aria-live="polite">
      <p className="poll-schedule-headline">{headline}</p>
      {startLabel || endLabel ? (
        <p className="poll-schedule-dates">
          {startLabel ? (
            <span>
              Starts <strong>{startLabel}</strong>
            </span>
          ) : null}
          {startLabel && endLabel ? <span aria-hidden="true"> · </span> : null}
          {endLabel ? (
            <span>
              Ends <strong>{endLabel}</strong>
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
