import { pollOptionLabels } from "../lib/polls.js";
import { countryLabel } from "../lib/countries.js";
import { pollCountryCodes, ELIGIBILITY_MODE } from "../lib/zkRequirements.js";
import { POLL_PHASE, getPollSchedule, scheduleBadge, scheduleSummary } from "../lib/pollSchedule.js";
import { navigate, pollPath } from "../lib/routing.js";

function optionKindLabel(poll) {
  const labels = pollOptionLabels(poll.options);
  if (labels.length === 2) return labels.join(" · ");
  return "Single choice";
}

export function PollCard({ poll, now, closed = null, statusPending = false, preview = false }) {
  const codes = pollCountryCodes(poll);
  const schedule = getPollSchedule(poll, now);
  const ended = closed === true || schedule.phase === POLL_PHASE.CLOSED;
  const statusKnown = ended || closed === false;
  const badge = ended
    ? scheduleBadge(schedule, true)
    : statusKnown
      ? scheduleBadge(schedule, false)
      : statusPending
        ? { label: "Checking status", kind: "soon" }
        : { label: "Status unavailable", kind: "soon" };
  const summary = ended
    ? scheduleSummary(schedule, true)
    : statusKnown
      ? scheduleSummary(schedule, false)
      : statusPending
        ? "Waiting for the chain status."
        : "The chain has not returned a status for this poll.";
  const modeLabel =
    poll.eligibilityMode === ELIGIBILITY_MODE.GATED
      ? "Gated"
      : poll.requiresZkPassport
        ? "Personhood"
        : "Open";
  // "Open" is eligibility, not the voting window. Hide it once voting has ended
  // so the card does not still read as an open poll.
  const showEligibility = modeLabel !== "Open" || (statusKnown && !ended);

  return (
    <button
      type="button"
      className="poll-card"
      onClick={() => {
        if (!preview) navigate(pollPath(poll.id));
      }}
    >
      <div className="poll-card-top">
        <span className="poll-card-id">#{poll.id}</span>
        <div className="poll-card-badges">
          {badge ? <span className={`elig-badge is-${badge.kind}`}>{badge.label}</span> : null}
          {showEligibility ? (
            <span className={`elig-badge${poll.requiresZkPassport ? " is-zk" : ""}`}>{modeLabel}</span>
          ) : null}
          {poll.creatorAuthoritative ? (
            <span className="elig-badge is-authority">Authoritative</span>
          ) : null}
          {poll.sealed ? <span className="elig-badge">Sealed</span> : null}
          {Number(poll.voteFrequency) === 1 ? <span className="elig-badge">Daily</span> : null}
        </div>
      </div>
      <h2 className="poll-card-title">{poll.title}</h2>
      {poll.description ? (
        <span className="poll-card-desc">
          <span className="poll-card-desc-text">{poll.description}</span>
        </span>
      ) : null}
      {summary ? (
        <p className={`poll-card-schedule${ended ? " is-ended" : ""}`}>{summary}</p>
      ) : null}
      <div className="poll-card-meta">
        <span>{(poll.options || []).length} options</span>
        <span>{optionKindLabel(poll)}</span>
      </div>
      {(poll.topics || []).length > 0 ? (
        <div className="topic-row">
          {poll.topics.map((t) => (
            <span key={t} className="topic-chip">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {codes.length > 0 ? (
        <p className="poll-card-countries">
          {codes.slice(0, 4).map(countryLabel).join(" · ")}
          {codes.length > 4 ? ` +${codes.length - 4}` : ""}
        </p>
      ) : null}
    </button>
  );
}
