import { useEffect, useState } from "react";
import { listHomePolls, refreshSharedCatalog } from "../lib/polls.js";
import { useNow } from "../hooks/useNow.js";
import { navigate, pollsPath } from "../lib/routing.js";
import { SITE_DESCRIPTION, SITE_NAME } from "../lib/site.js";
import { homeJsonLd } from "../lib/seo.js";
import { usePageSeo } from "../hooks/usePageSeo.js";
import { SiteFooter } from "./SiteFooter.jsx";
import { SiteHeader } from "./SiteHeader.jsx";
import { PollCard } from "./PollCard.jsx";

export function HomePage({ walletConnect }) {
  const now = useNow(1000);
  const [polls, setPolls] = useState(() => listHomePolls());
  const [catalogStatus, setCatalogStatus] = useState("Loading featured polls…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshSharedCatalog();
        if (cancelled) return;
        const next = listHomePolls();
        setPolls(next);
        setCatalogStatus(
          next.length === 1 ? "1 featured poll" : `${next.length} featured polls`,
        );
      } catch {
        if (!cancelled) {
          const next = listHomePolls();
          setPolls(next);
          setCatalogStatus("Local featured polls (shared fetch failed)");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  usePageSeo({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    path: "/",
    jsonLd: homeJsonLd(),
  });

  return (
    <main className="app app-wide">
      <SiteHeader walletConnect={walletConnect} current="home" />

      <header className="home-hero">
        <h1 className="home-hero-title">Independent voting, without exposing who you are</h1>
        <p className="lede">
          Private or open ballots on Aztec Testnet — pick a poll, connect a wallet, cast once.
        </p>
      </header>

      <section className="home-about" aria-label="How HappyVote works">
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

      <section id="polls" className="catalog" aria-label="Featured polls">
        <div className="catalog-head catalog-head-row">
          <div>
            <h2 className="section-title">Featured polls</h2>
            <p className="section-lede tight">A short list of current votes. Browse the full catalog anytime.</p>
            <p className="meta">{catalogStatus}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(pollsPath())}>
            All polls
          </button>
        </div>

        {polls.length === 0 ? (
          <div className="catalog-empty">
            <p className="meta">No featured polls right now.</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate(pollsPath())}>
              Browse all polls
            </button>
          </div>
        ) : (
          <div className="poll-grid">
            {polls.map((poll) => (
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
