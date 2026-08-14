import { useEffect, useMemo, useState } from "react";
import { listPolls, pollOptionLabels, refreshSharedCatalog } from "../lib/polls.js";
import { countryLabel } from "../lib/countries.js";
import { countriesFromRequirements, ELIGIBILITY_MODE } from "../lib/zkRequirements.js";
import { getPollSchedule, scheduleBadge, scheduleSummary } from "../lib/pollSchedule.js";
import { useNow } from "../hooks/useNow.js";
import { navigate, pollPath } from "../lib/routing.js";
import { SITE_DESCRIPTION, SITE_NAME } from "../lib/site.js";
import { homeJsonLd } from "../lib/seo.js";
import { usePageSeo } from "../hooks/usePageSeo.js";
import { SiteFooter } from "./SiteFooter.jsx";

export function PollListPage() {
  const now = useNow(1000);
  const [polls, setPolls] = useState(() => listPolls());
  const [catalogStatus, setCatalogStatus] = useState("Loading shared catalog…");
  const [topic, setTopic] = useState("all");
  const [country, setCountry] = useState("all");
  const [eligibility, setEligibility] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await refreshSharedCatalog();
        if (!cancelled) {
          setPolls(next);
          setCatalogStatus(`Shared catalog · ${next.length} polls`);
        }
      } catch {
        if (!cancelled) {
          setPolls(listPolls());
          setCatalogStatus("Local catalog (shared fetch failed)");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const topics = useMemo(() => {
    const set = new Set();
    for (const p of polls) for (const t of p.topics || []) set.add(t);
    return [...set].sort();
  }, [polls]);

  const countries = useMemo(() => {
    const set = new Set();
    for (const p of polls) {
      for (const c of p.countries || countriesFromRequirements(p.zkRequirements)) {
        set.add(c);
      }
    }
    return [...set].sort();
  }, [polls]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return polls.filter((p) => {
      if (topic !== "all" && !(p.topics || []).includes(topic)) return false;
      if (country !== "all") {
        const codes = p.countries || countriesFromRequirements(p.zkRequirements);
        if (!codes.includes(country)) return false;
      }
      if (eligibility === "open" && p.requiresZkPassport) return false;
      if (eligibility === "zk" && !p.requiresZkPassport) return false;
      if (q) {
        const hay = `${p.title} ${p.description || ""} ${(p.topics || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [polls, topic, country, eligibility, query]);

  usePageSeo({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    path: "/",
    jsonLd: homeJsonLd(),
  });

  return (
    <main className="app app-wide">
      <header className="home-hero">
        <h1 className="brand">
          HappyVote <span className="brand-on">on</span> <span>Aztec</span>
        </h1>
        <p className="lede">
          HappyVote on Aztec: private or open ballots on Aztec Testnet — pick a poll, connect a
          wallet, cast once.
        </p>
      </header>

      <section className="home-about" aria-labelledby="about-heading">
        <h2 id="about-heading" className="section-title">
          Independent voting, without exposing who you are
        </h2>
        <p className="section-lede">
          HappyVote is a technology layer for honest polls on Aztec Network: one verified person,
          one vote — with privacy that keeps voters safer where speech can be punished.
        </p>

        <div className="home-pillars">
          <article className="home-pillar">
            <h3>Private by design</h3>
            <p>
              Cast a private ballot so your wallet address stays hidden. The network still records a
              valid +1 to the chosen option — results stay auditable, identity does not.
            </p>
          </article>
          <article className="home-pillar">
            <h3>Verified, not doxed</h3>
            <p>
              ZKPassport can prove personhood or eligibility without handing organizers your
              passport data. Sybil resistance without a public voter registry.
            </p>
          </article>
          <article className="home-pillar">
            <h3>Safer where votes are risky</h3>
            <p>
              In places where political or social expression invites harassment or prosecution,
              independent on-chain voting lets people participate without publishing who chose what.
            </p>
          </article>
        </div>
      </section>

      <section id="polls" className="catalog" aria-label="Polls">
        <div className="catalog-head">
          <h2 className="section-title">Open polls</h2>
          <p className="section-lede tight">Search, filter, then open a ballot.</p>
          <p className="meta">{catalogStatus}</p>
        </div>

        <div className="catalog-toolbar">
          <label className="filter-field grow">
            <span className="sr-only">Search</span>
            <input
              type="search"
              placeholder="Search title or topic…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="filter-field">
            Topic
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="all">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            Country
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="all">All countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {countryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            Eligibility
            <select value={eligibility} onChange={(e) => setEligibility(e.target.value)}>
              <option value="all">Any</option>
              <option value="open">Open</option>
              <option value="zk">ZKPassport</option>
            </select>
          </label>
        </div>

        {filtered.length === 0 ? (
          <p className="meta">No polls match these filters.</p>
        ) : (
          <div className="poll-grid">
            {filtered.map((poll) => (
              <PollCard key={poll.id} poll={poll} now={now} />
            ))}
          </div>
        )}
      </section>

      <section className="home-trust" aria-labelledby="trust-heading">
        <h2 id="trust-heading" className="section-title">
          Why this matters
        </h2>
        <div className="home-trust-grid">
          <div>
            <h3>Independent of local gatekeepers</h3>
            <p>
              Ballots live on Aztec, not on a single server you have to trust. Tallies are public
              and checkable; organizers cannot quietly rewrite private votes after the fact.
            </p>
          </div>
          <div>
            <h3>Honest counts, protected voters</h3>
            <p>
              Privacy mode hides who voted; open mode is available when transparency of the voter
              is intentional. Either way, duplicate voting is constrained by the wallet (and
              ZKPassport when required).
            </p>
          </div>
        </div>
      </section>

      <SiteFooter
        disclaimer="HappyVote is a technology layer on Aztec Network. It is not an official electoral authority."
      />
    </main>
  );
}

function optionKindLabel(poll) {
  const labels = pollOptionLabels(poll.options);
  if (labels.length === 2) return labels.join(" · ");
  return "Single choice";
}

function PollCard({ poll, now }) {
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
