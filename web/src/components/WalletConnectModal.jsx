import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { extraWalletSources } from "../lib/walletClient.js";
import { discoverEthereumProviders } from "../lib/ethereumAccount.js";
import { parseAdminKeyMaterial } from "../lib/adminKeys.js";
import { Notice } from "./Notice.jsx";
import { explainError } from "../lib/userMessages.js";
import { isIosBrowser, isMobileBrowser } from "../lib/browser.js";

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

function WalletRow({ icon, name, hint, onClick }) {
  const content = (
    <>
      <ProviderIcon icon={icon} name={name} />
      <span className="wc-provider-copy">
        <strong>{name}</strong>
        <span>{hint}</span>
      </span>
    </>
  );
  if (!onClick) {
    return <div className="wc-provider wc-provider-static">{content}</div>;
  }
  return (
    <button type="button" className="wc-provider" onClick={onClick}>
      {content}
    </button>
  );
}

function ChooseSourceBody({
  providers,
  scanning,
  scanError,
  pickProvider,
  beginDiscovery,
  beginSession,
  beginEthereum,
  onImportKeys,
  onRescan,
  allowAdminImport,
}) {
  const ios = isIosBrowser();
  const extraSources = extraWalletSources();
  const found = providers ?? [];

  return (
    <div className="wc-stack">
      <p className="wc-hint">
        {ios ? (
          <>
            On iPhone use <strong>Browser session</strong> to vote. Identity verification is saved
            if this tab reloads.
          </>
        ) : (
          <>
            Vote with <strong>Browser session</strong>, connect an <strong>Ethereum wallet</strong>{" "}
            to keep the same Aztec address, or pick an installed Aztec wallet. If yours is not
            listed, approve HappyVote in the wallet popup and its name will appear here. The
            Ethereum signature is the account key. HappyVote does not receive that Ethereum
            address.
            {allowAdminImport ? (
              <>
                {" "}
                Use <strong>Import admin keys</strong> only on a trusted device.
              </>
            ) : null}
          </>
        )}
      </p>
      <div className="wc-stack">
        <WalletRow
          name="Browser session"
          hint={ios ? "Use this to vote on iPhone" : "Keys stay in this tab"}
          onClick={beginSession}
        />
        <WalletRow
          name="Ethereum wallet"
          hint="Same Aztec address when you reconnect"
          onClick={beginEthereum}
        />
        {found.map((provider) => (
          <WalletRow
            key={provider.id}
            icon={provider.icon}
            name={provider.name}
            hint="Browser extension"
            onClick={() => pickProvider(provider)}
          />
        ))}
        {extraSources.map((source) => (
          <WalletRow
            key={source.choice}
            name={source.name}
            hint={source.hint}
            onClick={() => beginDiscovery(source.choice)}
          />
        ))}
        {allowAdminImport ? (
          <WalletRow name="Import admin keys" hint="SECRET_KEY + SALT" onClick={onImportKeys} />
        ) : null}
      </div>
      {scanError ? (
        <Notice tone="error" title="Could not look for wallets">
          {scanError}
        </Notice>
      ) : null}
      {!ios && scanning ? <p className="wc-fine">Looking for wallet extensions…</p> : null}
      {!ios && !scanning && found.length === 0 ? (
        <button type="button" className="btn btn-ghost wc-full" onClick={onRescan}>
          Check again
        </button>
      ) : null}
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
      {error ? (
        <Notice tone="error" title="Could not import keys">
          {error}
        </Notice>
      ) : null}
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

const HAPPYVOTE_SITE = "https://aztec.happyvote.xyz/";

function copySiteWithCommand(text) {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    field.remove();
  }
  return copied;
}

function EthereumChooserBody({ choices, error, onPick, onBack, mobile }) {
  const [copyState, setCopyState] = useState("");
  const siteRef = useRef(null);

  async function copySite() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(HAPPYVOTE_SITE);
        setCopyState("copied");
        return;
      }
    } catch {
      /* The page may be unfocused. The command below is the second attempt. */
    }
    if (copySiteWithCommand(HAPPYVOTE_SITE)) {
      setCopyState("copied");
      return;
    }
    setCopyState("failed");
    siteRef.current?.focus();
    siteRef.current?.select();
  }

  return (
    <div className="wc-stack">
      {mobile ? (
        <>
          <p className="wc-hint">
            Open this site in your wallet’s browser, then choose <strong>Ethereum wallet</strong>{" "}
            again. MetaMask and Rabby can sign from that browser.
          </p>
          <input
            ref={siteRef}
            className="wc-mono wc-site"
            readOnly
            value={HAPPYVOTE_SITE}
            aria-label="Site address"
          />
          <button type="button" className="btn btn-primary wc-full" onClick={copySite}>
            {copyState === "copied" ? "Copied" : "Copy site address"}
          </button>
          {copyState === "failed" ? (
            <p className="wc-fine">Select the address above and copy it.</p>
          ) : null}
        </>
      ) : (
        <p className="wc-hint">
          Sign one message in an Ethereum wallet. That signature is the key to a private Aztec
          account, and the same wallet opens it again. HappyVote does not receive the Ethereum
          address. A contract wallet such as Safe cannot use this sign-in.
        </p>
      )}
      {error ? (
        <Notice tone="error" title="Could not look for Ethereum wallets">
          {error}
        </Notice>
      ) : null}
      {choices == null ? (
        mobile ? null : <p className="wc-fine">Looking for Ethereum wallets…</p>
      ) : choices.length === 0 ? (
        mobile ? null : (
          <p className="wc-hint">
            No Ethereum wallet was found in this browser. Install one, or use Browser session.
          </p>
        )
      ) : (
        choices.map((provider) => (
          <WalletRow
            key={provider.id}
            icon={provider.icon}
            name={provider.name}
            hint="Sign the account message"
            onClick={() => onPick(provider.provider)}
          />
        ))
      )}
      {mobile && (choices == null || choices.length === 0) ? null : (
        <p className="wc-fine">
          This browser remembers the account key so the next connect can skip the signature. Clear
          site data to remove it.
        </p>
      )}
      <button type="button" className="btn btn-ghost wc-full" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function isWebWalletChoice(choice) {
  return choice === "web" || extraWalletSources().some((source) => source.choice === choice);
}

function DiscoveringBody({ providers, pickProvider, reset, retry, choice }) {
  const extra = extraWalletSources().find((source) => source.choice === choice);
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), isWebWalletChoice(choice) ? 30_000 : 10_000);
    return () => clearTimeout(t);
  }, [attempt, choice]);

  if (providers.length === 0 && timedOut) {
    const isWeb = choice === "web";
    return (
      <div className="wc-stack">
        <p className="wc-hint">
          {extra?.timeoutHint
            ? extra.timeoutHint
            : isWeb
              ? "Couldn't reach the Aztec Demo Wallet. The first load can take about half a minute. If this stays up, open demo-wallet.aztec-labs.com in a new tab, then retry."
              : "No Aztec extension found. Unlock your wallet and retry, or use Browser session."}
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
        <button type="button" className="btn btn-ghost wc-full" onClick={reset}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="wc-stack">
      {providers.length === 0 ? (
        <p className="wc-hint">
          {extra?.loadingHint
            ? extra.loadingHint
            : choice === "web"
              ? "Loading the Demo Wallet… the first time can take about half a minute."
              : "Looking for wallets…"}
        </p>
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
        {isWebWalletChoice(choice)
          ? "Approve the request in the web wallet panel"
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
  beginEthereumAccount,
  rescanExtensions,
  allowAdminImport = false,
}) {
  const [importing, setImporting] = useState(false);
  const [ethereumChoices, setEthereumChoices] = useState(undefined);
  const [ethereumError, setEthereumError] = useState("");
  const ethereumLookup = useRef(0);

  useEffect(() => {
    if (phase.kind !== "choosing") {
      setImporting(false);
      setEthereumChoices(undefined);
      setEthereumError("");
    }
  }, [phase.kind]);

  async function showEthereumWallets() {
    const lookup = ++ethereumLookup.current;
    setImporting(false);
    setEthereumError("");
    setEthereumChoices(null);
    try {
      const found = await discoverEthereumProviders();
      if (lookup !== ethereumLookup.current) return;
      setEthereumChoices(found);
    } catch (error) {
      if (lookup !== ethereumLookup.current) return;
      setEthereumChoices([]);
      setEthereumError(error?.message || "Could not look for Ethereum wallets.");
    }
  }

  switch (phase.kind) {
    case "idle":
    case "connected":
    case "disconnected":
      return null;
    case "choosing":
      return (
        <Modal
          title={
            importing ? "Import admin keys" : ethereumChoices !== undefined ? "Ethereum wallet" : "Connect your wallet"
          }
          onClose={reset}
        >
          {importing && allowAdminImport ? (
            <ImportAdminKeysBody
              beginSessionWithKeys={beginSessionWithKeys}
              onBack={() => setImporting(false)}
            />
          ) : ethereumChoices !== undefined ? (
            <EthereumChooserBody
              choices={ethereumChoices}
              error={ethereumError}
              mobile={isMobileBrowser()}
              onPick={beginEthereumAccount}
              onBack={() => {
                ethereumLookup.current += 1;
                setEthereumChoices(undefined);
                setEthereumError("");
              }}
            />
          ) : (
            <ChooseSourceBody
              providers={phase.providers}
              scanning={Boolean(phase.scanning)}
              scanError={phase.scanError || ""}
              pickProvider={pickProvider}
              beginDiscovery={beginDiscovery}
              beginSession={beginSession}
              beginEthereum={showEthereumWallets}
              allowAdminImport={allowAdminImport}
              onImportKeys={() => setImporting(true)}
              onRescan={rescanExtensions}
            />
          )}
        </Modal>
      );
    case "creating-session":
      return (
        <Modal title="Setting up wallet" onClose={reset}>
          <p className="wc-hint">{phase.text || "Creating a browser wallet…"}</p>
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
    case "verifying": {
      const inWallet = phase.provider?.type !== "web";
      return (
        <Modal title="Verify connection" onClose={reject}>
          <p className="wc-hint">
            {inWallet ? (
              <>
                These emojis must match the ones in your wallet. Confirm them there. This window
                closes when the wallet accepts the connection.
              </>
            ) : (
              <>Confirm the same emoji grid is shown in your wallet — this blocks impersonation.</>
            )}
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
            {inWallet ? null : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirm}
                disabled={Boolean(phase.acknowledged)}
              >
                {phase.acknowledged ? "Waiting for the wallet…" : "Emojis match"}
              </button>
            )}
          </div>
        </Modal>
      );
    }
    case "error": {
      const explained = explainError({ message: phase.message }, "connect");
      return (
        <Modal title="Couldn't connect" onClose={reset}>
          <Notice tone="error" title={phase.title || explained.title}>
            {phase.message || explained.text}
          </Notice>
          <button type="button" className="btn btn-ghost wc-full" onClick={reset}>
            Close
          </button>
        </Modal>
      );
    }
    default:
      return null;
  }
}
