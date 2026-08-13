import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelConnection,
  confirmConnection,
  discoverWallets,
  getChainInfo,
  initiateConnection,
  unwrapAddress,
  verificationEmojis,
} from "../lib/walletClient.js";
import { happyVoteCapabilities } from "../lib/walletCapabilities.js";
import { isUserRejection, WalletUserRejectedError } from "../lib/walletErrors.js";

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
  const discoveryGenRef = useRef(0);
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

  const start = useCallback(() => {
    teardownConnection();
    void getChainInfo().catch(() => {});
    setPhase({ kind: "choosing" });
  }, [teardownConnection]);

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
      } catch (err) {
        if (discoveryGenRef.current !== gen) return;
        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : "Failed to start discovery",
        });
      }
    },
    [cleanup],
  );

  const pickProvider = useCallback(
    async (provider) => {
      panelProviderRef.current = provider;
      setPhase({ kind: "connecting", provider });
      try {
        const pending = await initiateConnection(provider);
        const emojis = verificationEmojis(pending);
        setPhase({ kind: "verifying", provider, pending, emojis });
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
        setPhase({
          kind: "error",
          message: looksLikePopupBlocked
            ? "The wallet popup was blocked by your browser."
            : raw,
        });
      }
    },
    [teardownConnection],
  );

  const confirm = useCallback(async () => {
    const current = phaseRef.current;
    if (current.kind !== "verifying") return;
    try {
      const wallet = await confirmConnection(current.pending);
      const rawAccounts = await resolveGrantedAccounts(wallet);

      if (rawAccounts.length === 0) {
        let version = "";
        try {
          version = BigInt((await getChainInfo()).version.toString()).toString();
        } catch {
          /* ignore */
        }
        teardownConnection();
        setPhase({
          kind: "error",
          message: `Your wallet connected but has no account on the current testnet${version ? ` (rollup ${version})` : ""}. Switch network or create an account, then reconnect.`,
        });
        return;
      }

      const addresses = rawAccounts
        .map((a) => unwrapAddress(a))
        .filter((a) => a !== null);

      if (addresses.length === 0) {
        teardownConnection();
        setPhase({ kind: "error", message: "Could not parse account address from wallet" });
        return;
      }

      armDisconnectWatch();
      if (addresses.length === 1) {
        setPhase({ kind: "connected", wallet, address: addresses[0] });
      } else {
        setPhase({ kind: "picking-account", wallet, accounts: addresses });
      }
    } catch (err) {
      teardownConnection();
      if (isUserRejection(err)) {
        setPhase({
          kind: "error",
          message: "Connection cancelled. Connect again to retry.",
        });
        return;
      }
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to confirm",
      });
    }
  }, [teardownConnection, armDisconnectWatch]);

  const pickAccount = useCallback((address) => {
    setPhase((prev) => {
      if (prev.kind !== "picking-account") return prev;
      return { kind: "connected", wallet: prev.wallet, address };
    });
  }, []);

  const reject = useCallback(() => {
    const current = phaseRef.current;
    if (current.kind === "verifying") {
      cancelConnection(current.pending);
      panelProviderRef.current = null;
    }
    setPhase({ kind: "idle" });
  }, []);

  const reset = useCallback(() => {
    const current = phaseRef.current;
    if (current.kind === "verifying") {
      cancelConnection(current.pending);
      panelProviderRef.current = null;
    } else {
      teardownConnection();
    }
    cleanup();
    setPhase({ kind: "idle" });
  }, [cleanup, teardownConnection]);

  const disconnectWallet = useCallback(() => {
    teardownConnection();
    cleanup();
    setPhase({ kind: "idle" });
  }, [cleanup, teardownConnection]);

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
  };
}
