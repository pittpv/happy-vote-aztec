import { useEffect, useMemo, useState } from "react";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import { fetchSiteStats } from "../lib/siteStats.js";
import { Notice } from "./Notice.jsx";
import { softenTechnicalText } from "../lib/userMessages.js";

countries.registerLocale(enLocale);

const RANGES = [7, 14, 30];

const SECTION_LABELS = {
  home: "Home",
  catalog: "All polls",
  polls: "Poll pages",
  legal: "Legal",
  other: "Other",
};

const DEVICE_LABELS = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
  other: "Other",
};

const BROWSER_LABELS = {
  chrome: "Chrome",
  safari: "Safari",
  firefox: "Firefox",
  edge: "Edge",
  other: "Other",
};

function labelFor(id, map) {
  if (id === "other" || id === "unknown") return "Other";
  return map[id] || id;
}

function countryName(code) {
  const c = String(code || "").toUpperCase();
  if (c === "OTHER" || c === "UNKNOWN") return "Other";
  return countries.getName(c, "en") || c;
}

function formatInt(n) {
  return new Intl.NumberFormat("en-US").format(Number(n) || 0);
}

function StatTable({ title, rows, labelOf }) {
  const max = Math.max(1, ...rows.map((r) => r.pageviews));
  if (rows.length === 0) {
    return (
      <div className="admin-stats-block">
        <h3>{title}</h3>
        <p className="hint">No data in this range yet.</p>
      </div>
    );
  }
  return (
    <div className="admin-stats-block">
      <h3>{title}</h3>
      <ul className="admin-stats-bars">
        {rows.map((row) => (
          <li key={row.id}>
            <span className="admin-stats-label">{labelOf(row.id)}</span>
            <span className="admin-stats-count">{formatInt(row.pageviews)}</span>
            <span className="admin-stats-track" aria-hidden="true">
              <i style={{ width: `${(row.pageviews / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminSiteStats() {
  const [days, setDays] = useState(14);
  const [token, setToken] = useState(
    () =>
      (typeof sessionStorage !== "undefined" && sessionStorage.getItem("happyvote.publishToken")) ||
      import.meta.env.VITE_POLLS_PUBLISH_TOKEN ||
      "",
  );
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(nextToken = token, nextDays = days) {
    if (!nextToken) {
      setError("Paste the catalog publish token to load visit aggregates.");
      setData(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("happyvote.publishToken", nextToken);
      }
      const result = await fetchSiteStats({ token: nextToken, days: nextDays });
      if (!result.ok) {
        setData(null);
        setError(result.error || "Could not load stats");
        return;
      }
      setData(result);
    } catch (err) {
      setData(null);
      setError(softenTechnicalText(err?.message || String(err)) || "Could not load stats.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const maxDay = useMemo(
    () => Math.max(1, ...(data?.days || []).map((d) => d.pageviews)),
    [data],
  );

  return (
    <section className="admin-form admin-stats" aria-label="Site visits">
      <h2>Visits</h2>
      <p className="hint">
        First-party totals only: no cookies, no IP storage, no poll IDs. Uniques reset each UTC day.
        Countries with fewer than 3 visits are grouped as Other.
      </p>

      <label>
        Catalog publish token
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Needed to read aggregates"
        />
      </label>

      <div className="admin-controls-row">
        {RANGES.map((range) => (
          <button
            key={range}
            type="button"
            className="chip"
            aria-pressed={days === range}
            onClick={() => setDays(range)}
          >
            {range}d
          </button>
        ))}
        <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => load()}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <Notice tone="error" title="Could not load visits">
          {error}
        </Notice>
      ) : null}

      {data?.persisted === false ? (
        <p className="hint">
          Aggregates are not persisted yet. Configure host object storage so daily totals survive
          deploys.
        </p>
      ) : null}

      {data ? (
        <>
          <div className="admin-stats-kpis">
            <div>
              <span>Pageviews</span>
              <strong>{formatInt(data.totals?.pageviews)}</strong>
            </div>
            <div>
              <span>Unique / day (sum)</span>
              <strong>{formatInt(data.totals?.uniques)}</strong>
            </div>
            <div>
              <span>Countries</span>
              <strong>{formatInt((data.countries || []).length)}</strong>
            </div>
          </div>

          <div className="admin-stats-block">
            <h3>Last {data.rangeDays} days</h3>
            <ul className="admin-stats-days">
              {(data.days || []).map((day) => (
                <li key={day.date} title={`${day.date}: ${day.pageviews} views, ${day.uniques} unique`}>
                  <span className="admin-stats-daybar" aria-hidden="true">
                    <i style={{ height: `${(day.pageviews / maxDay) * 100}%` }} />
                  </span>
                  <span className="admin-stats-daylabel">{day.date.slice(5)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="admin-stats-grid">
            <StatTable title="Countries" rows={data.countries || []} labelOf={countryName} />
            <StatTable
              title="Sections"
              rows={data.sections || []}
              labelOf={(id) => labelFor(id, SECTION_LABELS)}
            />
            <StatTable
              title="Devices"
              rows={data.devices || []}
              labelOf={(id) => labelFor(id, DEVICE_LABELS)}
            />
            <StatTable
              title="Browsers"
              rows={data.browsers || []}
              labelOf={(id) => labelFor(id, BROWSER_LABELS)}
            />
            <StatTable title="Referrers" rows={data.referrers || []} labelOf={(id) => id} />
          </div>
        </>
      ) : null}
    </section>
  );
}
