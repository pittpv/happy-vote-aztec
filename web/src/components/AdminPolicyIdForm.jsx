import { useEffect, useMemo, useState } from "react";
import { listPolls, publishPollPolicyId, refreshSharedCatalog } from "../lib/polls.js";
import {
  fetchZkPassportPolicies,
  zkPassportPublicDomain,
} from "../lib/zkPassportDashboard.js";
import { Notice } from "./Notice.jsx";

function policyLabel(poll) {
  const id = poll?.zkRequirements?.policyId;
  return id ? String(id) : "none";
}

function isZkPassportPoll(poll) {
  return (
    Number(poll?.eligibilityMode ?? 0) > 0 ||
    Boolean(poll?.requiresZkPassport) ||
    Boolean(poll?.zkRequirements)
  );
}

export function AdminPolicyIdForm({ active = true, busy, setBusy, setStatus }) {
  const [polls, setPolls] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [pollId, setPollId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [dashboardPolicies, setDashboardPolicies] = useState([]);
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
        const next = listPolls();
        setPolls(next);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    fetchZkPassportPolicies(zkPassportPublicDomain())
      .then((policies) => {
        if (!cancelled) setDashboardPolicies(policies);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[admin] dashboard policies", error);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const selected = useMemo(
    () => polls.find((poll) => poll.id === pollId) || null,
    [polls, pollId],
  );
  const zkPolls = useMemo(() => polls.filter(isZkPassportPoll), [polls]);

  useEffect(() => {
    if (!loaded || pollId) return;
    const preferred =
      zkPolls.find((poll) => poll.zkRequirements?.policyId) || zkPolls[0] || polls[0];
    if (preferred) setPollId(preferred.id);
  }, [loaded, pollId, polls, zkPolls]);

  useEffect(() => {
    if (!selected) return;
    setPolicyId(selected.zkRequirements?.policyId || "");
  }, [selected]);

  const currentId = selected ? policyLabel(selected) : "—";
  const canEdit = Boolean(selected && isZkPassportPoll(selected));
  const unchanged =
    (selected?.zkRequirements?.policyId || "") === String(policyId || "").trim();

  async function save(event) {
    event.preventDefault();
    if (!selected) {
      setStatus({ text: "Select a poll first.", tone: "error" });
      return;
    }
    if (!canEdit) {
      setStatus({
        title: "Open eligibility",
        text: `Poll #${selected.id} does not use ZKPassport, so PolicyID is not applied.`,
        tone: "error",
      });
      return;
    }
    if (!publishToken) {
      setStatus({
        title: "Publish token required",
        text: "Paste the catalog publish token so the PolicyID change is stored for everyone.",
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
    setStatus({ text: `Updating PolicyID for poll #${selected.id}…`, tone: "neutral" });
    try {
      const published = await publishPollPolicyId(selected.id, policyId, publishToken);
      if (published.persisted) {
        const next = listPolls();
        setPolls(next);
        const saved = published.policyId || "none";
        setStatus({
          text: `Poll #${selected.id} PolicyID is now ${saved}. Visitors will use the new Dashboard policy.`,
          tone: "ok",
        });
      } else {
        setStatus({
          title: "PolicyID not published",
          text: published.error || "Catalog publish failed.",
          tone: "error",
        });
      }
    } catch (error) {
      setStatus({
        title: "PolicyID not published",
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
      <h2>Policy ID</h2>
      <p className="meta">
        Change the ZKPassport Dashboard policy for an existing poll. This updates the shared catalog
        only — the on-chain metadata hash from create stays as-is. New proofs use the new policy;
        already-cast ballots are unchanged. Visitors may see the previous PolicyID for up to a
        minute because of catalog cache.
      </p>

      {zkPolls.length === 0 ? (
        <Notice tone="error" title="No ZKPassport polls">
          Create a poll with identity checks first, then you can attach or replace a Dashboard
          policy.
        </Notice>
      ) : null}

      <fieldset className="zk-req">
        <legend>Poll</legend>
        <label>
          Existing poll
          <select
            value={pollId}
            disabled={busy || polls.length === 0}
            onChange={(e) => setPollId(e.target.value)}
          >
            {polls.map((poll) => (
              <option key={poll.id} value={poll.id}>
                #{poll.id} {poll.title}
                {isZkPassportPoll(poll) ? "" : " · open"}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p className="meta">
            Current PolicyID: <code>{currentId}</code>
            {canEdit ? null : " · open eligibility, PolicyID is not used"}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="zk-req">
        <legend>Dashboard policy</legend>
        {dashboardPolicies.length > 0 ? (
          <label>
            Policies for this domain
            <select
              value={dashboardPolicies.some((p) => p.id === policyId) ? policyId : ""}
              disabled={busy || !canEdit}
              onChange={(e) => {
                if (e.target.value) setPolicyId(e.target.value);
              }}
            >
              <option value="">Custom id below…</option>
              {dashboardPolicies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.id}
                  {policy.purpose ? ` — ${policy.purpose}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Policy id
          <input
            type="text"
            value={policyId}
            disabled={busy || !canEdit}
            list="admin-dashboard-policy-ids"
            onChange={(e) => setPolicyId(e.target.value)}
            placeholder="pol_… or slug, empty to clear"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <datalist id="admin-dashboard-policy-ids">
          {dashboardPolicies.map((policy) => (
            <option key={policy.id} value={policy.id}>
              {policy.purpose || policy.id}
            </option>
          ))}
        </datalist>
        <p className="meta">
          Leave empty to drop the Dashboard lock and use the poll’s self-served checks instead.
        </p>
      </fieldset>

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

      <button
        type="submit"
        className="btn btn-primary"
        disabled={busy || !canEdit || unchanged}
      >
        Save PolicyID
      </button>
    </form>
  );
}
