import { Fr } from "@aztec-labs/aztec.js/fields";
import { WalletManager } from "@aztec-labs/wallet-sdk/manager";
import { hashToEmoji } from "@aztec-labs/wallet-sdk/crypto";
import { IframeWalletProvider } from "@aztec-labs/wallet-sdk/iframe/provider";
import { WalletMessageType } from "@aztec-labs/wallet-sdk/types";
import { createHappyVoteNode } from "./nodeClient.js";
import { getNodeUrl } from "./aztecClient.js";

export const APP_ID = "happyvote-aztec";
export const DEMO_WALLET_URL = "https://demo-wallet.aztec-labs.com";

function extraWalletOfferModules() {
  return Object.values(import.meta.glob("./wallet-offers/*.js", { eager: true }));
}

/** Extra Connect sources from a local-only folder (absent in the public tree). */
export function extraWalletSources() {
  return extraWalletOfferModules().flatMap((mod) =>
    typeof mod.extraWalletSources === "function" ? mod.extraWalletSources() : [],
  );
}

let cachedChainInfo = null;

export async function getChainInfo() {
  if (cachedChainInfo) return cachedChainInfo;
  const node = createHappyVoteNode(getNodeUrl());
  const info = await node.getNodeInfo();
  if (info?.l1ChainId == null || info?.rollupVersion == null) {
    throw new Error("Aztec node did not return l1ChainId / rollupVersion");
  }
  cachedChainInfo = {
    chainId: new Fr(BigInt(info.l1ChainId)),
    version: new Fr(BigInt(info.rollupVersion)),
  };
  return cachedChainInfo;
}

/**
 * The SDK probe gives the Demo Wallet 10s. The hosted bundle is large, so a cold
 * load misses that window and Connect reports the wallet as unreachable.
 */
export const WEB_WALLET_PROBE_MS = 30_000;

/**
 * Browser extensions answer wallet-sdk discovery with their own name and icon.
 * Previously approved origins can answer immediately; a new origin answers after
 * the user approves the request in the extension popup.
 * @param {import("@aztec-labs/aztec.js/account").ChainInfo} chainInfo
 * @param {(provider: { id: string, name: string, icon?: string }) => void} onWalletDiscovered
 * @param {number} [timeoutMs]
 */
export function discoverInstalledExtensions(chainInfo, onWalletDiscovered, timeoutMs = 60_000) {
  return discoverWallets(chainInfo, onWalletDiscovered, "extension", timeoutMs);
}

/**
 * Discover one source.
 * `extension` asks installed wallet-sdk extensions to identify themselves.
 * `web` and extra sources probe a specific iframe wallet URL.
 * @param {string} choice
 */
export function discoverWallets(chainInfo, onWalletDiscovered, choice, timeoutMs = 10_000) {
  if (choice === "web") {
    return discoverWebWallet(DEMO_WALLET_URL, chainInfo, onWalletDiscovered, WEB_WALLET_PROBE_MS, {
      canProve: false,
    });
  }
  const extra = extraWalletSources().find((source) => source.choice === choice);
  if (extra?.walletUrl) {
    return discoverWebWallet(extra.walletUrl, chainInfo, onWalletDiscovered, WEB_WALLET_PROBE_MS, {
      canProve: Boolean(extra.canProve),
      setupHint: extra.setupHint,
      accountTimeoutHint: extra.accountTimeoutHint,
      noAccountHint: extra.noAccountHint,
    });
  }
  return WalletManager.configure({
    extensions: { enabled: choice === "extension" },
    webWallets: { urls: [] },
  }).getAvailableWallets({
    chainInfo,
    appId: APP_ID,
    timeout: timeoutMs,
    onWalletDiscovered,
  });
}

/**
 * Hidden iframe probe with a longer timeout than @aztec-labs/wallet-sdk's built-in 10s.
 * @param {string} walletUrl
 * @param {import("@aztec-labs/aztec.js/account").ChainInfo} chainInfo
 * @param {(provider: import("@aztec-labs/wallet-sdk/iframe/provider").IframeWalletProvider) => void} onWalletDiscovered
 * @param {number} timeoutMs
 * @param {{ canProve?: boolean, setupHint?: string, accountTimeoutHint?: string, noAccountHint?: string }} [flags]
 */
function discoverWebWallet(walletUrl, chainInfo, onWalletDiscovered, timeoutMs, flags = {}) {
  let cancelled = false;
  let cleanup = () => {};
  const walletOrigin = new URL(walletUrl).origin;
  const iframe = document.createElement("iframe");
  iframe.credentialless = true;
  iframe.src = walletUrl;
  iframe.style.cssText =
    "display:none;width:0;height:0;border:none;position:absolute;top:-9999px;";
  iframe.allow = "storage-access; cross-origin-isolated";

  const done = new Promise((resolve, reject) => {
    let timer;
    cleanup = () => {
      window.removeEventListener("message", handler);
      clearTimeout(timer);
      iframe.remove();
    };
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    let step = "waiting-ready";
    const requestId = globalThis.crypto.randomUUID();

    function handler(event) {
      if (cancelled || event.origin !== walletOrigin) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (step === "waiting-ready" && msg.type === WalletMessageType.WALLET_READY) {
        step = "waiting-discovery";
        if (!iframe.contentWindow) {
          cleanup();
          reject(new Error("Iframe wallet did not expose a window"));
          return;
        }
        iframe.contentWindow.postMessage(
          { type: WalletMessageType.DISCOVERY, requestId, appId: "discovery-probe" },
          walletOrigin,
        );
        return;
      }
      if (
        step === "waiting-discovery" &&
        msg.type === WalletMessageType.DISCOVERY_RESPONSE &&
        msg.requestId === requestId
      ) {
        const info = msg.walletInfo;
        cleanup();
        if (!info?.id || !info?.name) {
          reject(new Error("Iframe wallet discovery response did not include wallet info"));
          return;
        }
        const provider = new IframeWalletProvider(info.id, info.name, info.icon, walletUrl, chainInfo);
        provider.canProve = Boolean(flags.canProve);
        if (flags.setupHint) provider.setupHint = flags.setupHint;
        if (flags.accountTimeoutHint) provider.accountTimeoutHint = flags.accountTimeoutHint;
        if (flags.noAccountHint) provider.noAccountHint = flags.noAccountHint;
        onWalletDiscovered(provider);
        resolve();
      }
    }

    window.addEventListener("message", handler);
    document.body.appendChild(iframe);
  });

  return {
    cancel() {
      cancelled = true;
      cleanup();
    },
    done,
  };
}

/**
 * Parent HappyVote uses COEP credentialless. Chromium blocks cross-origin
 * iframes unless they are marked credentialless — including the SDK panel.
 * Must be set before `src` is assigned.
 */
function armCredentiallessIframes() {
  const original = document.createElement.bind(document);
  document.createElement = function createElement(tagName, options) {
    const el = original(tagName, options);
    if (String(tagName).toLowerCase() === "iframe") {
      el.credentialless = true;
    }
    return el;
  };
  return () => {
    document.createElement = original;
  };
}

export async function initiateConnection(provider) {
  const stop = armCredentiallessIframes();
  try {
    return await provider.establishSecureChannel(APP_ID);
  } finally {
    stop();
  }
}

export async function confirmConnection(pending) {
  return pending.confirm();
}

export function cancelConnection(pending) {
  pending.cancel();
}

export function verificationEmojis(pending) {
  return hashToEmoji(pending.verificationHash);
}

export function unwrapAddress(raw) {
  if (typeof raw === "string") return raw;
  if (raw == null) return null;
  const r = raw;
  const inner = r.item ?? r.address ?? r;
  if (typeof inner === "string") return inner;
  if (inner && typeof inner.toString === "function") {
    const s = inner.toString();
    if (s && s !== "[object Object]") return s;
  }
  return null;
}
