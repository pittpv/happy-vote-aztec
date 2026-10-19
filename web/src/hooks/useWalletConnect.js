import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelConnection,
  confirmConnection,
  discoverInstalledExtensions,
  discoverWallets,
  getChainInfo,
  initiateConnection,
  unwrapAddress,
  verificationEmojis,
  watchAzguardInstalled,
} from "../lib/walletClient.js";
import { happyVoteCapabilities } from "../lib/walletCapabilities.js";
import { isUserRejection, WalletUserRejectedError } from "../lib/walletErrors.js";
import { explainError } from "../lib/userMessages.js";
import { isIosBrowser } from "../lib/browser.js";

async function resolveGrantedAccounts(wallet) {
  try {
    const granted = await wallet.requestCapabilities(happyVoteCapabilities());
    const accountsCap = granted.granted.find((c) => c.type === "accounts");
    if (accountsCap && "accounts" in accountsCap && accountsCap.accounts.length > 0) {
      return Array.from(accountsCap.accounts);
    }
  } catch (capErr) {
    if (isUserRejection(capErr)) throw new WalletUserRejectedError(capErr);
    console.warn("requestCapabilities failed, falling back to getAccounts:", capErr);
  }
  try {
    const accounts = Array.from(await wallet.getAccounts());
    if (accounts.length > 0) return accounts;
  } catch (getErr) {
    if (isUserRejection(getErr)) throw new WalletUserRejectedError(getErr);
    console.warn("getAccounts fallback also failed:", getErr);
  }
  return [];
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function swallowDisconnect(provider) {
  void Promise.resolve()
    .then(() => provider?.disconnect())
    .catch(() => {});
}

/**
 * Wallet connect state machine — mirrors aztec-faucet (Azguard extension + Demo Wallet).
 */
export function useWalletConnect() {
  const [phase, setPhase] = useState({ kind: "idle" });
  const sessionRef = useRef(null);
  const azguardWatchRef = useRef(null);
  const discoveryGenRef = useRef(0);
  const verifyGenRef = useRef(0);
  const verifyTaskRef = useRef(null);
  const panelProviderRef = useRef(null);
  const disconnectUnsubRef = useRef(null);
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const cleanup = useCallback(() => {
    discoveryGenRef.current += 1;
    sessionRef.current?.cancel();
    sessionRef.current = null;
    azguardWatchRef.current?.();
    azguardWatchRef.current = null;
  }, []);

  const teardownConnection = useCallback(() => {
    disconnectUnsubRef.current?.();
    disconnectUnsubRef.current = null;
    const provider = panelProviderRef.current;
    panelProviderRef.current = null;
    swallowDisconnect(provider);
  }, []);

  const armDisconnectWatch = useCallback(() => {
    const provider = panelProviderRef.current;
    if (!provider) return;
    disconnectUnsubRef.current?.();
    disconnectUnsubRef.current = provider.onDisconnect(() => {
      // iOS Safari hides this tab while the wallet app/popup is open and some
      // providers emit disconnect. Dropping the session here looks like a full reset.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      const dropped = panelProviderRef.current;
      panelProviderRef.current = null;
      disconnectUnsubRef.current = null;
      swallowDisconnect(dropped);
      setPhase({ kind: "disconnected" });
    });
  }, []);

  useEffect(
    () => () => {
      cleanup();
      teardownConnection();
    },
    [cleanup, teardownConnection],
  );

  const scanExtensions = useCallback(async (gen) => {
    setPhase((prev) =>
      prev.kind === "choosing" ? { ...prev, providers: [], scanning: true, scanError: "" } : prev,
    );
    try {
      const chainInfo = await getChainInfo();
      if (discoveryGenRef.current !== gen) return;
      const session = discoverInstalledExtensions(chainInfo, (provider) => {
        if (discoveryGenRef.current !== gen) return;
        setPhase((prev) => {
          if (prev.kind !== "choosing") return prev;
          const existing = prev.providers ?? [];
          if (existing.some((item) => item.id === provider.id)) return prev;
          return { ...prev, providers: [...existing, provider] };
        });
      });
      sessionRef.current = session;
      await session.done;
      if (discoveryGenRef.current !== gen) return;
      setPhase((prev) => (prev.kind === "choosing" ? { ...prev, scanning: false } : prev));
    } catch (err) {
      if (discoveryGenRef.current !== gen) return;
      const name = err?.name || "";
      const message = String(err?.message || err || "");
      if (name === "AbortError" || /abort|cancell?ed/i.test(message)) {
        setPhase((prev) => (prev.kind === "choosing" ? { ...prev, scanning: false } : prev));
        return;
      }
      const explained = explainError(err, "connect");
      setPhase((prev) =>
        prev.kind === "choosing"
          ? { ...prev, scanning: false, scanError: explained.text }
          : prev,
      );
    }
  }, []);

  const start = useCallback(() => {
    teardownConnection();
    cleanup();
    const gen = discoveryGenRef.current;
    const ios = isIosBrowser();
    setPhase({
      kind: "choosing",
      providers: [],
      scanning: !ios,
      azguardInstalled: false,
      azguardChecked: ios,
      scanError: "",
    });
    if (ios) return;
    azguardWatchRef.current = watchAzguardInstalled((installed) => {
      if (discoveryGenRef.current !== gen) return;
      setPhase((prev) =>
        prev.kind === "choosing"
          ? { ...prev, azguardInstalled: installed, azguardChecked: true }
          : prev,
      );
    });
    void scanExtensions(gen);
  }, [cleanup, scanExtensions, teardownConnection]);

  const beginDiscovery = useCallback(
    async (choice) => {
      cleanup();
      const gen = discoveryGenRef.current;
      setPhase({ kind: "discovering", providers: [], choice });
      try {
        const chainInfo = await getChainInfo();
        if (discoveryGenRef.current !== gen) return;
        sessionRef.current = discoverWallets(
          chainInfo,
          (p) => {
            setPhase((prev) =>
              prev.kind === "discovering"
                ? { kind: "discovering", providers: [...prev.providers, p], choice: prev.choice }
                : prev,
            );
          },
          choice,
          10_000,
        );
        void sessionRef.current.done?.catch((err) => {
          if (discoveryGenRef.current !== gen) return;
          const failed = explainError(err, "connect");
          setPhase({
            kind: "error",
            title: failed.title,
            message: failed.text,
          });
        });
      } catch (err) {
        if (discoveryGenRef.current !== gen) return;
        const explained = explainError(err, "connect");
        setPhase({
          kind: "error",
          title: explained.title,
          message: explained.text,
        });
      }
    },
    [cleanup],
  );

  const abandonVerification = useCallback(() => {
    verifyGenRef.current += 1;
    verifyTaskRef.current = null;
  }, []);

  /**
   * Extension wallets queue account requests until the user confirms the emoji
   * grid in the wallet. Starting that request while the grid is on screen lets
   * either confirmation finish the handshake: the HappyVote button, or the
   * wallet button (the queued call resolves and this dialog closes).
   */
  const runVerification = useCallback(
    async (gen, pending, provider) => {
      try {
        const wallet = await confirmConnection(pending);
        if (verifyGenRef.current !== gen) {
          swallowDisconnect(provider);
          return;
        }
        const isWeb = provider?.type === "web";
        if (isWeb) {
          setPhase({
            kind: "creating-session",
            text:
              provider?.setupHint ||
              "Use the Demo Wallet panel. If it has no account, open demo-wallet.aztec-labs.com in a new tab, create one, then click I've created an account in the panel.",
          });
        }
        const rawAccounts = await withTimeout(
          resolveGrantedAccounts(wallet),
          isWeb ? 120_000 : 30_000,
          provider?.accountTimeoutHint ||
            (isWeb
              ? "The Demo Wallet did not return an account. Open https://demo-wallet.aztec-labs.com, create an account, then reconnect and finish setup in the wallet panel."
              : "The wallet did not return an account in time. Reconnect and approve the request."),
        );
        if (verifyGenRef.current !== gen) {
          swallowDisconnect(provider);
          return;
        }

        if (rawAccounts.length === 0) {
          let version = "";
          try {
            version = BigInt((await getChainInfo()).version.toString()).toString();
          } catch (err) {
            if (verifyGenRef.current !== gen) {
              swallowDisconnect(provider);
              return;
            }
            throw err;
          }
          if (verifyGenRef.current !== gen) {
            swallowDisconnect(provider);
            return;
          }
          teardownConnection();
          const explained = explainError(
            new Error(
              provider?.noAccountHint ||
                (isWeb
                  ? "The Demo Wallet has no account in this browser yet. Open https://demo-wallet.aztec-labs.com, create an account, then reconnect."
                  : `Your wallet connected but has no account on the current testnet${version ? ` (rollup ${version})` : ""}. Switch network or create an account, then reconnect.`),
            ),
            "connect",
          );
          setPhase({
            kind: "error",
            title: explained.title,
            message: explained.text,
          });
          return;
        }

        const addresses = rawAccounts.map((a) => unwrapAddress(a)).filter((a) => a !== null);

        if (verifyGenRef.current !== gen) {
          swallowDisconnect(provider);
          return;
        }

        if (addresses.length === 0) {
          teardownConnection();
          setPhase({
            kind: "error",
            title: "Could not read wallet",
            message: "The wallet did not return a usable Aztec address. Reconnect and try another account.",
          });
          return;
        }

        armDisconnectWatch();
        if (addresses.length === 1) {
          setPhase({ kind: "connected", wallet, address: addresses[0] });
        } else {
          setPhase({ kind: "picking-account", wallet, accounts: addresses });
        }
      } catch (err) {
        if (verifyGenRef.current !== gen) {
          swallowDisconnect(provider);
          return;
        }
        teardownConnection();
        if (isUserRejection(err)) {
          const explained = explainError(new Error("Connection cancelled. Connect again to retry."), "connect");
          setPhase({
            kind: "error",
            title: explained.title,
            message: explained.text,
          });
          return;
        }
        const explained = explainError(err, "connect");
        setPhase({
          kind: "error",
          title: explained.title,
          message: explained.text,
        });
      }
    },
    [armDisconnectWatch, teardownConnection],
  );

  const startVerification = useCallback(
    (pending, provider) => {
      const gen = verifyGenRef.current;
      if (verifyTaskRef.current === gen) return;
      verifyTaskRef.current = gen;
      void runVerification(gen, pending, provider);
    },
    [runVerification],
  );

  const pickProvider = useCallback(
    async (provider) => {
      cleanup();
      abandonVerification();
      const gen = verifyGenRef.current;
      panelProviderRef.current = provider;
      setPhase({ kind: "connecting", provider });
      try {
        const pending = await initiateConnection(provider);
        if (verifyGenRef.current !== gen) {
          cancelConnection(pending);
          teardownConnection();
          return;
        }
        const emojis = verificationEmojis(pending);
        setPhase({ kind: "verifying", provider, pending, emojis, acknowledged: false });
        if (provider?.type !== "web") {
          startVerification(pending, provider);
        }
      } catch (err) {
        teardownConnection();
        const raw = err instanceof Error ? err.message : "Failed to connect";
        const lower = raw.toLowerCase();
        const looksLikePopupBlocked =
          lower.includes("popup") ||
          lower.includes("blocked") ||
          lower.includes("window.open") ||
          lower.includes("not allowed") ||
          lower.includes("user gesture");
        const explained = explainError(
          new Error(looksLikePopupBlocked ? "The wallet popup was blocked by your browser." : raw),
          "connect",
        );
        setPhase({
          kind: "error",
          title: explained.title,
          message: explained.text,
        });
      }
    },
    [abandonVerification, cleanup, startVerification, teardownConnection],
  );

  const confirm = useCallback(() => {
    const current = phaseRef.current;
    if (current.kind !== "verifying") return;
    setPhase((prev) => (prev.kind === "verifying" ? { ...prev, acknowledged: true } : prev));
    startVerification(current.pending, current.provider);
  }, [startVerification]);

  const pickAccount = useCallback((address) => {
    setPhase((prev) => {
      if (prev.kind !== "picking-account") return prev;
      return { kind: "connected", wallet: prev.wallet, address };
    });
  }, []);

  const reject = useCallback(() => {
    const current = phaseRef.current;
    abandonVerification();
    if (current.kind === "verifying") {
      cancelConnection(current.pending);
      teardownConnection();
    }
    setPhase({ kind: "idle" });
  }, [abandonVerification, teardownConnection]);

  const reset = useCallback(() => {
    const current = phaseRef.current;
    abandonVerification();
    if (current.kind === "verifying") {
      cancelConnection(current.pending);
    }
    teardownConnection();
    cleanup();
    setPhase({ kind: "idle" });
  }, [abandonVerification, cleanup, teardownConnection]);

  const disconnectWallet = useCallback(() => {
    abandonVerification();
    teardownConnection();
    cleanup();
    setPhase({ kind: "idle" });
  }, [abandonVerification, cleanup, teardownConnection]);

  const fail = useCallback((err) => {
    const explained = explainError(err, "connect");
    setPhase({
      kind: "error",
      title: explained.title,
      message: explained.text,
    });
  }, []);

  const setProgress = useCallback(
    (text) => {
      cleanup();
      setPhase({ kind: "creating-session", text: String(text || "Creating browser wallet…") });
    },
    [cleanup],
  );

  const adoptSession = useCallback((wallet, address) => {
    disconnectUnsubRef.current?.();
    disconnectUnsubRef.current = null;
    panelProviderRef.current = null;
    setPhase({ kind: "connected", wallet, address: String(address) });
  }, []);

  return {
    phase,
    start,
    beginDiscovery,
    pickProvider,
    confirm,
    reject,
    reset,
    disconnectWallet,
    pickAccount,
    adoptSession,
    fail,
    setProgress,
  };
}
