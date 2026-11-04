import { useEffect, useMemo, useState } from "react";
import { listPolls, publishHomepage, refreshPollMetaById, refreshSharedCatalog } from "../lib/polls.js";
import { curatedHomeFlag } from "../lib/catalogSections.js";
import { Notice } from "./Notice.jsx";

function rankOf(poll, index) {
  const rank = Number(poll.homeRank);
  return Number.isFinite(rank) ? rank : index + 1;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.showOnHome !== b.showOnHome) return a.showOnHome ? -1 : 1;
    if (a.homeRank !== b.homeRank) return a.homeRank - b.homeRank;
    return Number(a.id) - Number(b.id);
  });
}

export function AdminHomePolls({ active = true, busy, setBusy, setStatus }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [addId, setAddId] = useState("");
  const [publishToken, setPublishToken] = useState(
    () =>
      (typeof sessionStorage !== "undefined" && sessionStorage.getItem("happyvote.publishToken")) ||
      import.meta.env.VITE_POLLS_PUBLISH_TOKEN ||
      "",
  );

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await refreshSharedCatalog();
      } finally {
        if (cancelled) return;
        const next = listPolls().map((poll, index) => ({
          id: String(poll.id),
          title: poll.title,
          showOnHome: curatedHomeFlag(poll),
          homeRank: rankOf(poll, index),
        }));
        setRows(sortRows(next));
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const featuredRows = useMemo(
    () => rows.filter((row) => row.showOnHome),
    [rows],
  );
  const featuredCount = featuredRows.length;

  async function addById() {
    const id = addId.trim();
    if (!/^\d+$/.test(id)) {
      setStatus({ text: "Enter the poll id.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const meta = await refreshPollMetaById(id);
      if (!meta) {
        setStatus({ text: "That poll is not in the catalog.", tone: "error" });
        return;
      }
      setRows((prev) => {
        if (prev.some((row) => row.id === String(meta.id))) return prev;
        return sortRows([
          ...prev,
          {
            id: String(meta.id),
            title: meta.title,
            showOnHome: curatedHomeFlag(meta),
            homeRank: rankOf(meta, prev.length),
          },
        ]);
      });
      setAddId("");
      setStatus({ text: `Poll #${meta.id} is in the list. Check it, then save.`, tone: "ok" });
    } catch (error) {
      setStatus({ text: error?.message || String(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function toggle(id) {
    setRows((prev) => {
      const current = prev.find((row) => row.id === id);
      if (!current) return prev;
      const turningOn = !current.showOnHome;
      const maxRank = Math.max(0, ...prev.map((row) => row.homeRank));
      return sortRows(
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                showOnHome: turningOn,
                homeRank: turningOn ? maxRank + 1 : row.homeRank,
              }
            : row,
        ),
      );
    });
  }

  function move(id, direction) {
    setRows((prev) => {
      const featured = prev.filter((row) => row.showOnHome);
      const index = featured.findIndex((row) => row.id === id);
      const swapWith = index + direction;
      if (index < 0 || swapWith < 0 || swapWith >= featured.length) return prev;
      const a = featured[index];
      const b = featured[swapWith];
      return sortRows(
        prev.map((row) => {
          if (row.id === a.id) return { ...row, homeRank: b.homeRank };
          if (row.id === b.id) return { ...row, homeRank: a.homeRank };
          return row;
        }),
      );
    });
  }

  async function save(event) {
    event.preventDefault();
    if (!publishToken) {
      setStatus({
        title: "Publish token required",
        text: "Paste the catalog publish token so homepage picks can be stored for everyone.",
        tone: "error",
      });
      return;
    }
    try {
      sessionStorage.setItem("happyvote.publishToken", publishToken);
    } catch {
      /* ignore */
    }
    setBusy(true);
    setStatus({ text: "Saving homepage polls…", tone: "neutral" });
    try {
      const published = await publishHomepage(
        rows.map((row) => ({
          id: row.id,
          showOnHome: row.showOnHome,
          homeRank: row.homeRank,
        })),
        publishToken,
      );
      if (published.persisted) {
        setStatus({
          text: `Homepage updated · ${featuredCount} featured ${featuredCount === 1 ? "poll" : "polls"}.`,
          tone: "ok",
        });
      } else {
        setStatus({
          title: "Homepage not published",
          text: published.error || "Catalog publish failed.",
          tone: "error",
        });
      }
    } catch (error) {
      setStatus({
        title: "Homepage not published",
        text: error.message || String(error),
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return <p className="meta">Loading catalog…</p>;
  }

  return (
    <form className="admin-form" onSubmit={save}>
      <h2>Homepage polls</h2>
      <p className="meta">
        Home shows only the polls you mark here, in this order. A poll published from Create stays off
        the homepage until you check it. The person who created it cannot put it here. Keep the home
        list short — three to six cards reads clearly.
      </p>
      {featuredCount === 0 ? (
        <Notice tone="error" title="Nothing on home">
          Visitors will see an empty featured block and a link to All polls until you select at least
          one poll.
        </Notice>
      ) : null}

      <div className="catalog-toolbar">
        <label className="filter-field grow">
          Poll id
          <input
            inputMode="numeric"
            value={addId}
            disabled={busy}
            onChange={(e) => setAddId(e.target.value)}
            placeholder="Ended poll id"
          />
        </label>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={addById}>
          Add to this list
        </button>
      </div>
      <p className="meta">
        Open polls are listed below. An ended poll stays out of that list until you add its id.
      </p>

      <ul className="home-pick-list">
        {rows.map((row) => {
          const featuredIndex = featuredRows.findIndex((item) => item.id === row.id);
          return (
            <li key={row.id} className="home-pick-row" data-on={row.showOnHome || undefined}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={row.showOnHome}
                  disabled={busy}
                  onChange={() => toggle(row.id)}
                />
                <span>
                  <strong>#{row.id}</strong> {row.title}
                </span>
              </label>
              {row.showOnHome ? (
                <div className="home-pick-order">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy || featuredIndex <= 0}
                    onClick={() => move(row.id, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy || featuredIndex < 0 || featuredIndex >= featuredRows.length - 1}
                    onClick={() => move(row.id, 1)}
                  >
                    Down
                  </button>
                  <span className="meta">Home #{featuredIndex + 1}</span>
                </div>
              ) : (
                <span className="meta">Catalog only</span>
              )}
            </li>
          );
        })}
      </ul>

      <fieldset className="zk-req">
        <legend>Publish</legend>
        <label>
          Catalog publish token
          <input
            type="password"
            autoComplete="off"
            value={publishToken}
            disabled={busy}
            onChange={(e) => setPublishToken(e.target.value)}
            placeholder="Paste if not already stored in this tab"
          />
        </label>
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={busy || rows.length === 0}>
        Save homepage
      </button>
    </form>
  );
}
