import { pollOptionLabels } from "../lib/polls.js";
import { countryLabel } from "../lib/countries.js";
import { countriesFromRequirements, ELIGIBILITY_MODE } from "../lib/zkRequirements.js";
import { getPollSchedule, scheduleBadge, scheduleSummary } from "../lib/pollSchedule.js";
import { navigate, pollPath } from "../lib/routing.js";

function optionKindLabel(poll) {
  const labels = pollOptionLabels(poll.options);
  if (labels.length === 2) return labels.join(" · ");
  return "Single choice";
}

export function PollCard({ poll, now }) {
  const codes = poll.countries || countriesFromRequirements(poll.zkRequirements);
  const schedule = getPollSchedule(poll, now);
  const badge = scheduleBadge(schedule);
  const summary = scheduleSummary(schedule);
  const modeLabel =
    poll.eligibilityMode === ELIGIBILITY_MODE.GATED
      ? "Gated"
      : poll.requiresZkPassport
        ? "Personhood"
        : "Open";

  return (
    <button
      type="button"
      className="poll-card"
      onClick={() => navigate(pollPath(poll.id))}
    >
      <div className="poll-card-top">
        <span className="poll-card-id">#{poll.id}</span>
        <div className="poll-card-badges">
          {badge ? <span className={`elig-badge is-${badge.kind}`}>{badge.label}</span> : null}
          <span className={`elig-badge${poll.requiresZkPassport ? " is-zk" : ""}`}>{modeLabel}</span>
          {poll.sealed ? <span className="elig-badge">Sealed</span> : null}
          {Number(poll.voteFrequency) === 1 ? <span className="elig-badge">Daily</span> : null}
        </div>
      </div>
      <h2 className="poll-card-title">{poll.title}</h2>
      {poll.description ? <p className="poll-card-desc">{poll.description}</p> : null}
      {summary ? <p className="poll-card-schedule">{summary}</p> : null}
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
