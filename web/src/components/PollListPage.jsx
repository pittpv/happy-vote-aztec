import { useEffect, useMemo, useState } from "react";
import { listPolls, refreshSharedCatalog } from "../lib/polls.js";
import { countryLabel } from "../lib/countries.js";
import { countriesFromRequirements } from "../lib/zkRequirements.js";
import { useNow } from "../hooks/useNow.js";
import { SITE_NAME } from "../lib/site.js";
import { metaDescription, pageTitle, webPageJsonLd } from "../lib/seo.js";
import { usePageSeo } from "../hooks/usePageSeo.js";
import { SiteFooter } from "./SiteFooter.jsx";
import { SiteHeader } from "./SiteHeader.jsx";
import { PollCard } from "./PollCard.jsx";

const POLLS_DESCRIPTION =
  "Browse every HappyVote poll on Aztec Testnet. Search by title or topic, filter by country and eligibility, then open a ballot.";

export function PollListPage({ walletConnect }) {
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

  const pollsTitle = pageTitle("All polls");
  usePageSeo({
    title: pollsTitle,
    description: metaDescription(POLLS_DESCRIPTION),
    path: "/polls",
    jsonLd: webPageJsonLd({
      title: pollsTitle,
      description: POLLS_DESCRIPTION,
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

      <SiteFooter
        disclaimer="HappyVote is a technology layer on Aztec Network. It is not an official electoral authority."
      />
    </main>
  );
}
