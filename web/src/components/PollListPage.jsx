import { useEffect, useMemo, useState } from "react";
import { fetchEndedPollPage, listPolls, refreshSharedCatalog } from "../lib/polls.js";
import { countryLabel } from "../lib/countries.js";
import { pollCountryCodes } from "../lib/zkRequirements.js";
import { useNow } from "../hooks/useNow.js";
import { SITE_NAME } from "../lib/site.js";
import { POLLS_PAGE_DESCRIPTION, pageTitle, webPageJsonLd } from "../lib/seo.js";
import { usePageSeo } from "../hooks/usePageSeo.js";
import { SiteFooter } from "./SiteFooter.jsx";
import { SiteHeader } from "./SiteHeader.jsx";
import { PollCard } from "./PollCard.jsx";
import { EarlierNetworks } from "./EarlierNetworks.jsx";
import { cardClosedFlag, partitionPolls } from "../lib/catalogClosure.js";
import { orderAuthoritative, sortPolls, splitAuthority } from "../lib/catalogSections.js";
import { useCatalogClosures } from "../hooks/useCatalogClosures.js";

function PollGrid({ polls, now, closures, closed }) {
  return (
    <div className="poll-grid">
      {polls.map((poll) => (
        <PollCard
          key={poll.id}
          poll={poll}
          now={now}
          closed={closed === null ? null : cardClosedFlag(closures, poll, now)}
        />
      ))}
    </div>
  );
}

function uniquePolls(polls) {
  const seen = new Set();
  const out = [];
  for (const poll of polls) {
    const id = String(poll.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(poll);
  }
  return out;
}

function endedInLane(polls, archive, sort, now, closures, lane) {
  const groups = partitionPolls(polls, now, closures);
  const merged = [...groups.ended, ...archive];
  return lane === "authoritative" ? orderAuthoritative(merged, sort) : sortPolls(merged, sort);
}

function CatalogLane({ id, title, note, polls, now, closures, closureError, filtersOn, emptyLabel }) {
  const groups = partitionPolls(polls, now, closures);
  const showActive = groups.active.length > 0 || groups.unknown.length === 0;
  return (
    <section className="catalog-lane" aria-labelledby={id}>
      <header className="catalog-lane-head">
        <h2 id={id} className="section-title">
          {title}
        </h2>
        <p className="section-lede">{note}</p>
      </header>
      {showActive ? (
        <section className="catalog-group" aria-labelledby={`${id}-active`}>
          <h3 id={`${id}-active`} className="catalog-group-title">
            Active
            {groups.active.length > 0 ? (
              <span className="catalog-count">{groups.active.length}</span>
            ) : null}
          </h3>
          {groups.active.length === 0 ? (
            <p className="meta">
              {filtersOn
                ? `No active ${emptyLabel} polls match these filters.`
                : `No active ${emptyLabel} polls.`}
            </p>
          ) : (
            <PollGrid polls={groups.active} now={now} closures={closures} />
          )}
        </section>
      ) : null}
      {groups.unknown.length > 0 ? (
        <section className="catalog-group" aria-labelledby={`${id}-unknown`}>
          <h3 id={`${id}-unknown`} className="catalog-group-title">
            Status unavailable
          </h3>
          <PollGrid polls={groups.unknown} now={now} closures={closures} closed={null} />
        </section>
      ) : null}
    </section>
  );
}

export function PollListPage({ walletConnect }) {
  const now = useNow(1000);
  const [polls, setPolls] = useState(() => listPolls());
  const [catalogStatus, setCatalogStatus] = useState("Loading shared catalog…");
  const [topic, setTopic] = useState("all");
  const [country, setCountry] = useState("all");
  const [eligibility, setEligibility] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("id");
  const [archive, setArchive] = useState({ authoritative: [], users: [] });
  const [archiveTotal, setArchiveTotal] = useState({ authoritative: 0, users: 0 });
  const [archiveBusy, setArchiveBusy] = useState({ authoritative: false, users: false });
  const { closures, error: closureError, ready: closuresReady } = useCatalogClosures();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await refreshSharedCatalog();
        if (!cancelled) {
          setPolls(next);
          setCatalogStatus(`Shared catalog · ${next.length} polls still open or on the homepage`);
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
      for (const c of pollCountryCodes(p)) {
        set.add(c);
      }
    }
    return [...set].sort();
  }, [polls]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return polls.filter((p) => {
      if (p.hidden) return false;
      if (topic !== "all" && !(p.topics || []).includes(topic)) return false;
      if (country !== "all") {
        const codes = pollCountryCodes(p);
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

  const closureMap = closuresReady ? closures : closureError ? {} : null;
  const lanes =
    closureMap == null
      ? null
      : (() => {
          const split = splitAuthority(filtered);
          return {
            authoritative: orderAuthoritative(split.authoritative, sort),
            users: sortPolls(split.users, sort),
          };
        })();

  const filtersOn =
    topic !== "all" || country !== "all" || eligibility !== "all" || query.trim() !== "";

  const endedBusy = archiveBusy.authoritative || archiveBusy.users;
  const endedCards =
    lanes == null
      ? []
      : uniquePolls(
          sort === "id"
            ? [
                ...endedInLane(
                  lanes.authoritative,
                  archive.authoritative,
                  sort,
                  now,
                  closureMap,
                  "authoritative",
                ),
                ...endedInLane(lanes.users, archive.users, sort, now, closureMap, "users"),
              ]
            : sortPolls(
                [
                  ...endedInLane(
                    lanes.authoritative,
                    archive.authoritative,
                    sort,
                    now,
                    closureMap,
                    "authoritative",
                  ),
                  ...endedInLane(lanes.users, archive.users, sort, now, closureMap, "users"),
                ],
                sort,
              ),
        );
  const liveEndedCount =
    lanes == null
      ? 0
      : partitionPolls(lanes.authoritative, now, closureMap).ended.length +
        partitionPolls(lanes.users, now, closureMap).ended.length;
  const endedTotal = archiveTotal.authoritative + archiveTotal.users + liveEndedCount;
  const endedHasMore =
    archive.authoritative.length < archiveTotal.authoritative ||
    archive.users.length < archiveTotal.users;

  useEffect(() => {
    let cancelled = false;
    setArchiveBusy({ authoritative: true, users: true });
    const timer = setTimeout(() => {
      setArchive({ authoritative: [], users: [] });
      setArchiveTotal({ authoritative: 0, users: 0 });
      for (const lane of ["authoritative", "users"]) {
        setArchiveBusy((prev) => ({ ...prev, [lane]: true }));
        fetchEndedPollPage({
          lane,
          offset: 0,
          sort,
          query,
          topic,
          country,
          eligibility,
        })
          .then((page) => {
            if (cancelled) return;
            setArchive((prev) => ({ ...prev, [lane]: page.polls }));
            setArchiveTotal((prev) => ({ ...prev, [lane]: page.total }));
          })
          .catch(() => {
            if (cancelled) return;
            setArchive((prev) => ({ ...prev, [lane]: [] }));
            setArchiveTotal((prev) => ({ ...prev, [lane]: 0 }));
          })
          .finally(() => {
            if (!cancelled) setArchiveBusy((prev) => ({ ...prev, [lane]: false }));
          });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sort, query, topic, country, eligibility]);

  function loadMoreEnded() {
    for (const lane of ["authoritative", "users"]) {
      const offset = archive[lane].length;
      if (archiveBusy[lane] || offset >= archiveTotal[lane]) continue;
      setArchiveBusy((prev) => ({ ...prev, [lane]: true }));
      fetchEndedPollPage({
        lane,
        offset,
        sort,
        query,
        topic,
        country,
        eligibility,
      })
        .then((page) => {
          setArchive((prev) => ({ ...prev, [lane]: [...prev[lane], ...page.polls] }));
          setArchiveTotal((prev) => ({ ...prev, [lane]: page.total }));
        })
        .finally(() => {
          setArchiveBusy((prev) => ({ ...prev, [lane]: false }));
        });
    }
  }

  function clearFilters() {
    setTopic("all");
    setCountry("all");
    setEligibility("all");
    setQuery("");
  }

  const pollsTitle = pageTitle("All polls");
  usePageSeo({
    title: pollsTitle,
    description: POLLS_PAGE_DESCRIPTION,
    path: "/polls",
    jsonLd: webPageJsonLd({
      title: pollsTitle,
      description: POLLS_PAGE_DESCRIPTION,
      path: "/polls",
      breadcrumbs: [
        { name: SITE_NAME, path: "/" },
        { name: "All polls", path: "/polls" },
      ],
    }),
  });

  return (
    <main className="app app-wide">
      <SiteHeader walletConnect={walletConnect} current="polls" />

      <header className="catalog-hero">
        <p className="vote-kicker">Catalog</p>
        <h1 className="catalog-hero-title">All polls</h1>
        <p className="lede">
          Search, filter, then open a ballot. New votes appear here as they are published.
        </p>
        <p className="meta">{catalogStatus}</p>
      </header>

      <section id="polls" className="catalog" aria-label="All polls">

        <div className="catalog-toolbar catalog-toolbar--filters" role="search">
          <label className="filter-field filter-search">
            <span className="filter-label">Search</span>
            <input
              type="search"
              placeholder="Search title or topic"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="filter-field filter-select">
            <span className="filter-label">Topic</span>
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="all">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field filter-select">
            <span className="filter-label">Country</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="all">All countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {countryLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field filter-select">
            <span className="filter-label">Eligibility</span>
            <select value={eligibility} onChange={(e) => setEligibility(e.target.value)}>
              <option value="all">Any</option>
              <option value="open">Open</option>
              <option value="zk">ZKPassport</option>
            </select>
          </label>
          <label className="filter-field filter-select">
            <span className="filter-label">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="id">Poll id</option>
              <option value="newest">Newest</option>
              <option value="ending">Ending soon</option>
            </select>
          </label>
          {filtersOn ? (
            <button type="button" className="btn btn-ghost catalog-clear" onClick={clearFilters}>
              Clear
            </button>
          ) : null}
        </div>

        {closureError ? (
          <p className="status" data-tone="error">
            {closureError}
          </p>
        ) : null}
        {lanes == null ? (
          <p className="meta">Checking which polls have ended…</p>
        ) : (
          <>
            <CatalogLane
              id="catalog-authoritative"
              title="Authoritative polls"
              note="Polls published by HappyVote and by accounts marked authoritative."
              polls={lanes.authoritative}
              now={now}
              closures={closureMap}
              closureError={closureError}
              filtersOn={filtersOn}
              emptyLabel="authoritative"
            />
            <CatalogLane
              id="catalog-users"
              title="User polls"
              note="Polls published by other accounts."
              polls={lanes.users}
              now={now}
              closures={closureMap}
              closureError={closureError}
              filtersOn={filtersOn}
              emptyLabel="user"
            />
            {!closureError || endedCards.length > 0 ? (
              <section className="catalog-lane catalog-ended" aria-labelledby="catalog-ended" aria-busy={endedBusy}>
                <header className="catalog-lane-head">
                  <h2 id="catalog-ended" className="section-title">
                    Ended
                    {endedCards.length > 0 ? (
                      <span className="catalog-count">
                        {endedHasMore ? `${endedCards.length} of ${endedTotal}` : endedCards.length}
                      </span>
                    ) : null}
                  </h2>
                  <p className="section-lede">Polls whose voting has closed, from both sections above.</p>
                </header>
                {endedCards.length === 0 ? (
                  <p className="meta">
                    {endedBusy
                      ? "Loading ended polls…"
                      : filtersOn
                        ? "No ended polls match these filters."
                        : "No ended polls."}
                  </p>
                ) : (
                  <>
                    <PollGrid polls={endedCards} now={now} closures={closureMap} closed />
                    {endedHasMore ? (
                      <button
                        type="button"
                        className="btn btn-ghost catalog-more"
                        disabled={endedBusy}
                        onClick={loadMoreEnded}
                      >
                        {endedBusy ? "Loading…" : "Show more ended polls"}
                      </button>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}
          </>
        )}
        <EarlierNetworks />
      </section>

      <SiteFooter
        disclaimer="HappyVote is a technology layer on Aztec Network. It is not an official electoral authority."
      />
    </main>
  );
}
