import { useMemo, useRef, useState } from "react";
import { ZKPassportQRCode } from "@zkpassport/ui/react";
import "@zkpassport/ui/styles.css";
import {
  describeZkRequirements,
  applyZkRequirementsToQuery,
  resolveEffectiveZkRequirements,
} from "../lib/zkRequirements.js";
import { reverifyZkPassport } from "../lib/zkIdentity.js";
import { Notice } from "./Notice.jsx";
import { explainError, softenTechnicalText } from "../lib/userMessages.js";

/**
 * ZKPassport gate (Phase 4).
 * Uses per-poll requirements from catalog / admin create (no env policy override).
 * Real proofs are re-verified server-side before unlocking the ballot.
 */
export function ZkPassportGate({
  pollId,
  requirements,
  verifiedId = null,
  serverVerified = false,
  onVerified,
}) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState(() => (verifiedId ? "verified" : "scan"));
  const [done, setDone] = useState(() =>
    verifiedId
      ? { uniqueIdentifier: verifiedId, serverVerified: Boolean(serverVerified), mock: false }
      : null,
  );
  const queryRef = useRef(null);
  const sdkEnabled = import.meta.env.VITE_ZKPASSPORT_ENABLED === "true";
  const allowMock =
    import.meta.env.DEV || import.meta.env.VITE_ALLOW_ZKPASSPORT_MOCK === "true";
  const domain =
    import.meta.env.VITE_ZKPASSPORT_DOMAIN ||
    (typeof window !== "undefined" ? window.location.hostname : "aztec.happyvote.xyz");
  const devMode =
    import.meta.env.VITE_ZKPASSPORT_DEV_MODE === "true" ||
    (import.meta.env.DEV && import.meta.env.VITE_ZKPASSPORT_DEV_MODE !== "false");
  const serverReverify = import.meta.env.VITE_ZKPASSPORT_SERVER_REVERIFY !== "false";

  const effective = useMemo(
    () => resolveEffectiveZkRequirements(requirements),
    [requirements],
  );
  const scope = effective.policyId ? undefined : `poll:${pollId}`;
  const lines = describeZkRequirements(effective);

  const [seenPollId, setSeenPollId] = useState(pollId);
  if (seenPollId !== pollId) {
    setSeenPollId(pollId);
    setError(null);
    setBusy(false);
    setExpanded(false);
    if (verifiedId) {
      setPhase("verified");
      setDone({
        uniqueIdentifier: verifiedId,
        serverVerified: Boolean(serverVerified),
        mock: false,
      });
    } else {
      setPhase("scan");
      setDone(null);
    }
  } else if (verifiedId && phase !== "verified") {
    setPhase("verified");
    setDone({
      uniqueIdentifier: verifiedId,
      serverVerified: Boolean(serverVerified),
      mock: false,
    });
  }

  function mockVerify() {
    if (!allowMock) {
      throw new Error("ZKPassport mock verify is disabled outside development");
    }
    const uniqueIdentifier = `mock-poll:${pollId}-${crypto.randomUUID().slice(0, 8)}`;
    finishVerified({
      uniqueIdentifier,
      mock: true,
      serverVerified: false,
    });
  }

  function finishVerified({ uniqueIdentifier, mock, serverVerified: serverOk }) {
    const payload = {
      uniqueIdentifier,
      verified: true,
      mock: Boolean(mock),
      serverVerified: Boolean(serverOk),
      requirements: effective,
    };
    setDone({
      uniqueIdentifier,
      serverVerified: Boolean(serverOk),
      mock: Boolean(mock),
    });
    setPhase("verified");
    setExpanded(false);
    onVerified(payload);
  }

  const logoUrl =
    typeof window !== "undefined" ? `${window.location.origin}/favicon.svg` : "/favicon.svg";

  if (phase === "verified" && done) {
    return (
      <div className="zk-gate zk-gate--verified" aria-live="polite">
        <button
          type="button"
          className="zk-verified-bar"
          aria-expanded={expanded}
          aria-controls="zk-verified-details"
          onClick={() => setExpanded((open) => !open)}
        >
          <span className="zk-verified-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12.5 9.5 17 19 7.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="zk-verified-copy">
            <strong>Identity verified</strong>
            <span>
              You can vote on this poll. Document data stayed on your device.
              {done.mock ? " (dev mock)" : ""}
            </span>
          </span>
          {done.serverVerified ? (
            <span className="zk-verified-badge">Server check OK</span>
          ) : null}
          <span className="zk-verified-chevron" aria-hidden="true">
            {expanded ? "−" : "+"}
          </span>
        </button>
        <div
          className="zk-verified-details"
          id="zk-verified-details"
          hidden={!expanded}
        >
            <p className="zk-verified-details-lede">Checks that passed for this poll:</p>
            <ul className="req-preview">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="zk-verified-id">
              Personhood ID <code>{shortId(done.uniqueIdentifier)}</code>
              {effective.policyId ? (
                <>
                  {" "}
                  · policy <code>{effective.policyId}</code>
                </>
              ) : (
                <>
                  {" "}
                  · scope <code>poll:{pollId}</code>
                </>
              )}
            </p>
          </div>
      </div>
    );
  }

  return (
    <div className={`zk-gate${phase === "rechecking" ? " zk-gate--rechecking" : ""}`}>
      <div className="zk-gate-copy">
        <div className="zk-gate-head">
          <h2>Identity check</h2>
          {effective.policyId ? (
            <code className="zk-scope">policy {effective.policyId}</code>
          ) : (
            <code className="zk-scope">poll:{pollId}</code>
          )}
        </div>
        <p className="zk-gate-lede">
          This poll requires ZKPassport. Document data stays on your device.
          {serverReverify ? " Proofs are re-checked on the server before you can vote." : null}
        </p>
        {devMode ? (
          <p className="zk-gate-note">Dev Mode is on — mock/dev passports are accepted.</p>
        ) : null}
        <ul className="req-preview">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <div className="zk-gate-footer">
          <div className="zk-actions">
            {allowMock ? (
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={mockVerify}>
                Verify with ZKPassport (dev mock)
              </button>
            ) : null}
            {!sdkEnabled && !allowMock ? (
              <Notice tone="error" title="ZKPassport is not enabled">
                This poll cannot verify identity until the site is configured for ZKPassport.
              </Notice>
            ) : null}
            {phase === "rechecking" || busy ? (
              <p className="status" data-tone="neutral">
                Confirming proofs on the server…
              </p>
            ) : null}
          </div>

          {error ? (
            <Notice tone="error" title={error.title}>
              {error.text}
            </Notice>
          ) : null}
        </div>
      </div>

      {sdkEnabled && phase === "scan" ? (
        <div className="zk-qr">
          <ZKPassportQRCode
            domain={domain}
            name="HappyVote on Aztec"
            logo={logoUrl}
            purpose={effective.purpose}
            scope={scope}
            devMode={devMode}
            theme="dark"
            display={{ header: false, steps: true, appLinks: true }}
            query={(queryBuilder) => {
              const doneQuery = applyZkRequirementsToQuery(queryBuilder, effective);
              queryRef.current = doneQuery.query;
              return doneQuery;
            }}
            onResult={async ({ verified, uniqueIdentifier, proofs, result, queryResultErrors }) => {
              setError(null);
              if (!verified) {
                setError({
                  title: "Identity check failed",
                  text: formatZkVerifyFailure(queryResultErrors),
                });
                return;
              }
              if (!uniqueIdentifier) {
                setError({
                  title: "Identity check failed",
                  text: "ZKPassport did not return an identifier. Scan again.",
                });
                return;
              }

              if (!serverReverify) {
                finishVerified({
                  uniqueIdentifier,
                  mock: false,
                  serverVerified: false,
                });
                return;
              }

              setBusy(true);
              setPhase("rechecking");
              try {
                const server = await reverifyZkPassport({
                  proofs,
                  originalQuery: queryRef.current,
                  queryResult: result,
                  scope,
                  domain,
                  devMode,
                  pollId,
                });
                finishVerified({
                  uniqueIdentifier: server.uniqueIdentifier,
                  mock: false,
                  serverVerified: true,
                });
              } catch (err) {
                console.error(err);
                setError(explainError(err, "generic"));
                setPhase("scan");
              } finally {
                setBusy(false);
              }
            }}
            onError={(err) => {
              console.error(err);
              setError(formatZkNetworkError(err));
            }}
            onReject={() =>
              setError({
                title: "Verification cancelled",
                text: "Rejected in the ZKPassport app. Scan again when you are ready.",
              })
            }
          />
        </div>
      ) : null}

      {phase === "rechecking" ? (
        <div className="zk-recheck" role="status" aria-live="polite">
          <span className="zk-recheck-spin" aria-hidden="true" />
          <p>
            <strong>Proof received</strong>
            Confirming on the HappyVote server before unlocking the ballot.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function shortId(value) {
  const s = String(value || "");
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function collectZkErrorMessages(queryResultErrors) {
  if (!queryResultErrors || typeof queryResultErrors !== "object") return [];
  const messages = [];
  for (const group of Object.values(queryResultErrors)) {
    if (!group || typeof group !== "object") continue;
    for (const detail of Object.values(group)) {
      const msg = detail?.message;
      if (typeof msg === "string" && msg.trim()) messages.push(msg.trim());
    }
  }
  return [...new Set(messages)];
}

function formatZkVerifyFailure(queryResultErrors) {
  const details = collectZkErrorMessages(queryResultErrors).map((msg) =>
    softenTechnicalText(msg, 160),
  );
  if (details.some((msg) => /unrecognized root certificate/i.test(msg))) {
    return "The site could not reach the certificate registry. Refresh and try again.";
  }
  if (details.length > 0) return details.join(" · ");
  return "The passport proof was not accepted. Scan again.";
}

function formatZkNetworkError(err) {
  const msg = err?.message || String(err);
  if (/content security policy|failed to fetch|refused to connect/i.test(msg)) {
    return {
      title: "Certificate registry blocked",
      text: "This site needs access to the ZKPassport registry. Check ad blockers, then retry.",
    };
  }
  return explainError(err, "generic");
}
