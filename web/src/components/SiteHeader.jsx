import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { shortAddr } from "../lib/format.js";
import { homePath, navigate, pollsPath } from "../lib/routing.js";

const NAV = [
  { id: "home", label: "Home", path: homePath() },
  { id: "polls", label: "All polls", path: pollsPath() },
];

export function SiteHeader({ walletConnect, current }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelId = useId();
  const closeRef = useRef(null);
  const connected = walletConnect?.phase.kind === "connected";
  const connecting =
    walletConnect &&
    !["idle", "connected", "disconnected"].includes(walletConnect.phase.kind);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setOpen(false);
  }, [current]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  function connectWallet() {
    setOpen(false);
    walletConnect.start();
  }

  function disconnectWallet() {
    walletConnect.disconnectWallet();
  }

  return (
    <header className="site-header">
      <button type="button" className="site-logo" onClick={() => go(homePath())}>
        HappyVote <span className="brand-on">on</span> <span>Aztec</span>
      </button>

      <nav className="site-nav-desktop" aria-label="Primary">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`site-nav-link${current === item.id ? " is-current" : ""}`}
            aria-current={current === item.id ? "page" : undefined}
            onClick={() => go(item.path)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="site-header-end">
        {connected ? (
          <span className="site-wallet-chip" title={String(walletConnect.phase.address)}>
            {shortAddr(String(walletConnect.phase.address))}
          </span>
        ) : null}
        <button
          type="button"
          className="site-menu-btn"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={open ? "is-open" : undefined} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      </div>

      {mounted && open
        ? createPortal(
            <div className="site-menu-overlay" role="presentation" onClick={() => setOpen(false)}>
              <aside
                id={panelId}
                className="site-menu-panel"
                role="dialog"
                aria-modal="true"
                aria-label="Site menu"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="site-menu-head">
                  <p className="site-menu-kicker">Menu</p>
                  <button
                    ref={closeRef}
                    type="button"
                    className="wc-close"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                  >
                    ×
                  </button>
                </div>

                <nav className="site-menu-nav" aria-label="Site">
                  {NAV.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`site-menu-link${current === item.id ? " is-current" : ""}`}
                      aria-current={current === item.id ? "page" : undefined}
                      onClick={() => go(item.path)}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>

                <section className="site-menu-section" aria-labelledby="menu-wallet-heading">
                  <h2 id="menu-wallet-heading">Wallet</h2>
                  {connected ? (
                    <>
                      <p className="site-menu-wallet-status" data-ok>
                        Connected
                      </p>
                      <p className="site-menu-wallet-addr">{String(walletConnect.phase.address)}</p>
                      <button type="button" className="btn btn-ghost" onClick={disconnectWallet}>
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="site-menu-wallet-status">
                        {connecting ? "Connecting…" : "Not connected"}
                      </p>
                      <p className="meta">Connect to vote. Public tallies stay visible either way.</p>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={connecting}
                        onClick={connectWallet}
                      >
                        Connect Aztec wallet
                      </button>
                    </>
                  )}
                </section>

                <section className="site-menu-section is-muted" aria-labelledby="menu-later-heading">
                  <h2 id="menu-later-heading">Later</h2>
                  <p className="meta">Language and light/dark theme will live here.</p>
                </section>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}
