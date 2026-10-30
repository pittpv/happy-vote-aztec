import { useEffect, useState } from "react";

function formatCaptured(iso) {
  const time = Date.parse(iso || "");
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function EarlierNetworks() {
  const [archive, setArchive] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/earlier-networks");
        const body = await response.json().catch(() => ({}));
        const networks = Array.isArray(body.networks) ? body.networks : [];
        if (!response.ok || networks.length === 0) {
          if (!cancelled) setArchive({ networks: [] });
          return;
        }
        if (!cancelled) {
          setArchive({
            source: body.source === "snapshot" ? "snapshot" : "live",
            capturedAt: body.capturedAt || null,
            networks,
          });
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setArchive({ networks: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!archive || archive.networks.length === 0) return null;

  const savedOn = archive.source === "snapshot" ? formatCaptured(archive.capturedAt) : "";

  return (
    <section className="catalog-group" aria-labelledby="catalog-earlier">
      <h2 id="catalog-earlier" className="section-title">
        Earlier networks
      </h2>
      <p className="meta">
        Ballots recorded on previous Aztec networks. Voting on this site uses the current network.
        {savedOn ? ` Snapshot from ${savedOn}.` : ""}
      </p>
      {archive.networks.map((network) => (
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
