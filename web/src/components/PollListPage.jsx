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

function CatalogLane({
  id,
  title,
  note,
  polls,
  archive,
  archiveTotal,
  onArchiveMore,
  archiveBusy,
  sort,
  lane,
  now,
  closures,
  closureError,
  filtersOn,
  emptyLabel,
}) {
  const groups = partitionPolls(polls, now, closures);
  const endedCards =
    lane === "authoritative"
      ? orderAuthoritative([...groups.ended, ...archive], sort)
      : sortPolls([...groups.ended, ...archive], sort);
  const laneEmpty = polls.length === 0 && archive.length === 0;
  return (
    <section className="catalog-lane" aria-labelledby={id}>
      <h2 id={id} className="catalog-lane-title">
        {title}
      </h2>
      <p className="meta">{note}</p>
      {laneEmpty ? (
        <p className="meta">
          {filtersOn ? `No ${emptyLabel} polls match these filters.` : `No ${emptyLabel} polls yet.`}
        </p>
      ) : (
        <>
          {!closureError || groups.active.length > 0 ? (
            <section className="catalog-group" aria-labelledby={`${id}-active`}>
              <h3 id={`${id}-active`} className="section-title">
                Active
              </h3>
              {groups.active.length === 0 ? (
                <p className="meta">No active polls.</p>
              ) : (
                <PollGrid polls={groups.active} now={now} closures={closures} />
              )}
            </section>
          ) : null}
          {!closureError || endedCards.length > 0 ? (
            <section className="catalog-group" aria-labelledby={`${id}-ended`}>
              <h3 id={`${id}-ended`} className="section-title">
                Ended
              </h3>
              {endedCards.length === 0 ? (
                <p className="meta">{archiveBusy ? "Loading ended polls…" : "No ended polls."}</p>
              ) : (
                <>
                  <PollGrid polls={endedCards} now={now} closures={closures} closed />
                  {archive.length < archiveTotal ? (
                    <button
                      type="button"
                      className="btn btn-ghost catalog-more"
                      disabled={archiveBusy}
                      onClick={onArchiveMore}
                    >
                      {archiveBusy ? "Loading…" : "Show more ended polls"}
                    </button>
                  ) : null}
                </>
              )}
            </section>
          ) : null}
          {groups.unknown.length > 0 ? (
            <section className="catalog-group" aria-labelledby={`${id}-unknown`}>
              <h3 id={`${id}-unknown`} className="section-title">
                Status unavailable
              </h3>
              <PollGrid polls={groups.unknown} now={now} closures={closures} closed={null} />
            </section>
          ) : null}
        </>
      )}
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

  useEffect(() => {
    let cancelled = false;
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

  function loadMoreEnded(lane) {
    const offset = archive[lane].length;
    if (archiveBusy[lane] || offset >= archiveTotal[lane]) return;
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
          <label className="filter-field">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="id">Poll id</option>
              <option value="newest">Newest</option>
              <option value="ending">Ending soon</option>
            </select>
          </label>
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
              title="Авторитетные голосования"
              note="Polls published by HappyVote, and polls from accounts marked authoritative."
              polls={lanes.authoritative}
              archive={archive.authoritative}
              archiveTotal={archiveTotal.authoritative}
              onArchiveMore={() => loadMoreEnded("authoritative")}
              archiveBusy={archiveBusy.authoritative}
              sort={sort}
              lane="authoritative"
              now={now}
              closures={closureMap}
              closureError={closureError}
              filtersOn={filtersOn}
              emptyLabel="authoritative"
            />
            <CatalogLane
              id="catalog-users"
              title="Users polls"
              note="Polls published by other accounts."
              polls={lanes.users}
              archive={archive.users}
              archiveTotal={archiveTotal.users}
              onArchiveMore={() => loadMoreEnded("users")}
              archiveBusy={archiveBusy.users}
              sort={sort}
              lane="users"
              now={now}
              closures={closureMap}
              closureError={closureError}
              filtersOn={filtersOn}
              emptyLabel="user"
            />
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
