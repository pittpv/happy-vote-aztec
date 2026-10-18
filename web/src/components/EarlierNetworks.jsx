import { useEffect, useState } from "react";

export function EarlierNetworks() {
  const [archive, setArchive] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/earlier-networks");
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || `HTTP ${response.status}`);
        }
        if (!Array.isArray(body.networks)) {
          throw new Error("Invalid earlier-networks response");
        }
        if (!cancelled) setArchive(body.networks);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Earlier network results are unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="catalog-group" aria-labelledby="catalog-earlier">
      <h2 id="catalog-earlier" className="section-title">
        Earlier networks
      </h2>
      <p className="meta">
        Ballots recorded on previous Aztec networks. Voting on this site uses the current network.
      </p>
      {error ? <p className="meta">{error}</p> : null}
      {!archive && !error ? <p className="meta">Loading earlier networks…</p> : null}
      {archive?.map((network) => (
        <div key={network.id} className="archive-network">
          <h3 className="archive-network-name">{network.name}</h3>
          <details className="archive-contract">
            <summary>
              <span className="sr-only">Contract </span>
              {network.contractAddress}
            </summary>
            <ul className="archive-polls">
              {network.polls.map((poll) => (
                <li key={poll.id} className="archive-poll">
                  <h4 className="archive-poll-title">{poll.title}</h4>
                  {poll.resultsHidden ? (
                    <p className="meta">Results stay hidden until voting closes.</p>
                  ) : (
                    <>
                      <ul className="archive-options">
                        {poll.options.map((option) => (
                          <li key={option.label} className="archive-option">
                            <span>{option.label}</span>
                            <span className="archive-option-count">{option.votes}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="archive-total">
                        {poll.total} {poll.total === 1 ? "vote" : "votes"}
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ))}
    </section>
  );
}
