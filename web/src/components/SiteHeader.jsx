import { useEffect, useId, useRef, useState } from "react";
import { shortAddr } from "../lib/format.js";
import { createPath, homePath, faqPath, navigate, pollsPath } from "../lib/routing.js";

const DESKTOP_HEADER = "(min-width: 900px)";

const NAV = [
  { id: "polls", label: "All polls", path: pollsPath() },
  { id: "create", label: "Create", path: createPath() },
  { id: "faq", label: "FAQ", path: faqPath() },
];

export function SiteHeader({ walletConnect, current }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const menuBtnRef = useRef(null);
  const logoRef = useRef(null);
  const connected = walletConnect?.phase.kind === "connected";
  const connecting =
    walletConnect &&
    !["idle", "connected", "disconnected"].includes(walletConnect.phase.kind);

  useEffect(() => {
    setOpen(false);
  }, [current]);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_HEADER);
    function onChange() {
      if (!media.matches) return;
      setOpen(false);
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active.closest(".site-menu-btn, .site-menu-panel") &&
        logoRef.current
      ) {
        logoRef.current.focus();
      }
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuBtnRef.current?.focus();
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
    <header className={`site-header${open ? " is-open" : ""}`}>
      <button ref={logoRef} type="button" className="site-logo" onClick={() => go(homePath())}>
        HappyVote <span className="brand-on">on</span> <span className="brand-aztec">Aztec</span>
      </button>

      <div className="site-header-end">
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
        {walletConnect ? (
          <div className="site-wallet-desktop">
            {connected ? (
              <>
                <span className="site-wallet-chip" title={String(walletConnect.phase.address)}>
                  {shortAddr(String(walletConnect.phase.address))}
                </span>
                <button type="button" className="site-disconnect" onClick={disconnectWallet}>
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                className="site-connect"
                disabled={connecting}
                onClick={connectWallet}
              >
                {connecting ? "Connecting…" : "Connect"}
              </button>
            )}
          </div>
        ) : null}
        <button
          ref={menuBtnRef}
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

      {open ? (
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
        </div>
      ) : null}
    </header>
  );
}
