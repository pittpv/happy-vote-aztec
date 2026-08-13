import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AZGUARD_STORE_URL } from "../lib/walletClient.js";
import { parseAdminKeyMaterial } from "../lib/adminKeys.js";

function ProviderIcon({ icon, name }) {
  const [broken, setBroken] = useState(false);
  if (!icon || broken) {
    const letter = name.trim().charAt(0).toUpperCase() || "W";
    return <div className="wc-provider-fallback">{letter}</div>;
  }
  return (
    <img
      src={icon}
      alt=""
      className="wc-provider-icon"
      onError={() => setBroken(true)}
    />
  );
}

function Modal({ title, children, onClose }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="wc-overlay" role="presentation" onClick={onClose}>
      <div
        className="wc-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wc-modal-head">
          <h3>{title}</h3>
          <button type="button" className="wc-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ChooseSourceBody({ beginDiscovery, beginSession, onImportKeys, allowAdminImport }) {
  const [selected, setSelected] = useState("session");
  const options = [
    {
      choice: "session",
      name: "Browser session",
      hint: "New voter account",
    },
    ...(allowAdminImport
      ? [
          {
            choice: "import",
            name: "Import admin keys",
            hint: "SECRET_KEY + SALT",
          },
        ]
      : []),
    {
      choice: "extension",
      name: "Browser Extension",
      hint: "Azguard",
    },
    {
      choice: "web",
      name: "Web Wallet",
      hint: "Aztec Demo Wallet",
    },
  ];
  return (
    <div className="wc-stack">
      <p className="wc-hint">
        Prefer <strong>Browser session</strong> for voting
        {allowAdminImport ? (
          <>
            . Use <strong>Import admin keys</strong> only on a trusted device.
          </>
        ) : (
          "."
        )}
      </p>
      <div className="wc-choice-grid wc-choice-grid-2">
        {options.map((o) => (
          <button
            key={o.choice}
            type="button"
            className="wc-choice"
            aria-pressed={selected === o.choice}
            onClick={() => setSelected(o.choice)}
          >
            <strong>{o.name}</strong>
            <span>{o.hint}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary wc-full"
        onClick={() => {
          if (selected === "session") beginSession();
          else if (selected === "import") onImportKeys();
          else beginDiscovery(selected);
        }}
      >
        Continue
      </button>
    </div>
  );
}

function ImportAdminKeysBody({ beginSessionWithKeys, onBack }) {
  const [secretKey, setSecretKey] = useState("");
  const [signingKey, setSigningKey] = useState("");
  const [salt, setSalt] = useState("");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState(null);

  function submit(event) {
    event.preventDefault();
    setError(null);
    try {
      const keys = parseAdminKeyMaterial({ secretKey, signingKey, salt, paste });
      setSecretKey("");
      setSigningKey("");
      setSalt("");
      setPaste("");
      beginSessionWithKeys(keys);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  return (
    <form className="wc-stack admin-import" onSubmit={submit} autoComplete="off">
      <p className="wc-hint">
        Paste keys from <code>aztec/.env</code> (deploy admin). They stay in this browser tab’s
        memory for the session only — not written to localStorage or sent to our servers. Close the
        tab when finished.
      </p>
      <label className="wc-field">
        Paste .env lines (optional)
        <textarea
          rows={4}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={"SECRET_KEY=0x…\nSIGNING_KEY=0x…\nSALT=0x…"}
          spellCheck={false}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
        />
      </label>
      <label className="wc-field">
        SECRET_KEY
        <input
          type="password"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
        />
      </label>
      <label className="wc-field">
        SIGNING_KEY
        <input
          type="password"
          value={signingKey}
          onChange={(e) => setSigningKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
        />
      </label>
      <label className="wc-field">
        SALT
        <input
          type="password"
          value={salt}
          onChange={(e) => setSalt(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
        />
      </label>
      {error ? <p className="wc-error">{error}</p> : null}
      <div className="wc-row">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="submit" className="btn btn-primary">
          Import & connect
        </button>
      </div>
    </form>
  );
}

function DiscoveringBody({ providers, pickProvider, reset, retry, choice }) {
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(t);
  }, [attempt]);

  if (providers.length === 0 && timedOut) {
    const isWeb = choice === "web";
    return (
      <div className="wc-stack">
        <p className="wc-hint">
          {isWeb
            ? "Couldn't reach the Aztec Demo Wallet. Check that demo-wallet.aztec-labs.com is reachable, then retry."
            : "No Aztec extension found. Unlock Azguard and retry, or install it."}
        </p>
        <button
          type="button"
          className="btn btn-primary wc-full"
          onClick={() => {
            setTimedOut(false);
            setAttempt((a) => a + 1);
            retry();
          }}
        >
          Retry
        </button>
        {!isWeb ? (
          <a
            className="btn btn-ghost wc-full"
            href={AZGUARD_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Install Azguard →
          </a>
        ) : null}
        <button type="button" className="btn btn-ghost wc-full" onClick={reset}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="wc-stack">
      {providers.length === 0 ? (
        <p className="wc-hint">Looking for wallets…</p>
      ) : (
        providers.map((p) => (
          <button
            key={p.id}
            type="button"
            className="wc-provider"
            onClick={() => pickProvider(p)}
          >
            <ProviderIcon icon={p.icon} name={p.name} />
            <span>{p.name}</span>
          </button>
        ))
      )}
      <p className="wc-fine">
        {choice === "web"
          ? "Approve the request in the web wallet"
          : "Approve the request in your extension"}
      </p>
    </div>
  );
}

export function WalletConnectModal({
  phase,
  pickProvider,
  confirm,
  reject,
  reset,
  pickAccount,
  beginDiscovery,
  beginSession,
  beginSessionWithKeys,
  allowAdminImport = false,
}) {
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (phase.kind !== "choosing") setImporting(false);
  }, [phase.kind]);

  switch (phase.kind) {
    case "idle":
    case "connected":
    case "disconnected":
      return null;
    case "choosing":
      return (
        <Modal title={importing ? "Import admin keys" : "Connect your wallet"} onClose={reset}>
          {importing && allowAdminImport ? (
            <ImportAdminKeysBody
              beginSessionWithKeys={beginSessionWithKeys}
              onBack={() => setImporting(false)}
            />
          ) : (
            <ChooseSourceBody
              beginDiscovery={beginDiscovery}
              beginSession={beginSession}
              allowAdminImport={allowAdminImport}
              onImportKeys={() => setImporting(true)}
            />
          )}
        </Modal>
      );
    case "discovering":
      return (
        <Modal title="Choose a wallet" onClose={reset}>
          <DiscoveringBody
            providers={phase.providers}
            pickProvider={pickProvider}
            reset={reset}
            retry={() => beginDiscovery(phase.choice)}
            choice={phase.choice}
          />
        </Modal>
      );
    case "picking-account":
      return (
        <Modal title="Choose an account" onClose={reset}>
          <div className="wc-stack">
            <p className="wc-hint">Your wallet has multiple accounts. Pick one for HappyVote.</p>
            {phase.accounts.map((addr) => (
              <button
                key={addr}
                type="button"
                className="wc-provider"
                onClick={() => pickAccount(addr)}
              >
                <span className="wc-mono">{addr}</span>
              </button>
            ))}
            <button type="button" className="btn btn-ghost wc-full" onClick={reset}>
              Cancel
            </button>
          </div>
        </Modal>
      );
    case "connecting":
      return (
        <Modal title={`Connecting to ${phase.provider.name}`} onClose={reset}>
          <p className="wc-hint">Establishing secure channel…</p>
        </Modal>
      );
    case "verifying":
      return (
        <Modal title="Verify connection" onClose={reject}>
          <p className="wc-hint">
            Confirm the same emoji grid is shown in your wallet — this blocks impersonation.
          </p>
          <div className="wc-emoji-grid" aria-label="Verification emojis">
            {Array.from(phase.emojis).map((emoji, i) => (
              <div key={i} className="wc-emoji">
                {emoji}
              </div>
            ))}
          </div>
          <div className="wc-row">
            <button type="button" className="btn btn-ghost" onClick={reject}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={confirm}>
              Emojis match
            </button>
          </div>
        </Modal>
      );
    case "error":
      return (
        <Modal title="Couldn't connect" onClose={reset}>
          <p className="wc-error">{phase.message}</p>
          <button type="button" className="btn btn-ghost wc-full" onClick={reset}>
            Close
          </button>
        </Modal>
      );
    default:
      return null;
  }
}
