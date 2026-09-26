import { Fr } from "@aztec/aztec.js/fields";
import { WalletManager } from "@aztec/wallet-sdk/manager";
import { hashToEmoji } from "@aztec/wallet-sdk/crypto";
import { IframeWalletProvider } from "@aztec/wallet-sdk/iframe/provider";
import { WalletMessageType } from "@aztec/wallet-sdk/types";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { getNodeUrl } from "./aztecClient.js";

export const APP_ID = "happyvote-aztec";
export const DEMO_WALLET_URL = "https://demo-wallet.aztec-labs.com";
export const AZGUARD_STORE_URL =
  "https://chromewebstore.google.com/detail/azguard-wallet/pliilpgjnbkndmcgkfpdmmpkagblcmgi";
export const FEE_JUICE_FAUCET_URL = "https://aztec-faucet.nethermind.io/";

let cachedChainInfo = null;

export async function getChainInfo() {
  if (cachedChainInfo) return cachedChainInfo;
  const node = createAztecNodeClient(getNodeUrl());
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
 * Discover only the chosen source so extension approval prompts fire after the user picks.
 * @param {"extension" | "web"} choice
 */
export function discoverWallets(chainInfo, onWalletDiscovered, choice, timeoutMs = 10_000) {
  if (choice === "web") {
    return discoverDemoWallet(chainInfo, onWalletDiscovered, WEB_WALLET_PROBE_MS);
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
 * Hidden iframe probe with a longer timeout than @aztec/wallet-sdk's built-in 10s.
 * @param {import("@aztec/aztec.js/account").ChainInfo} chainInfo
 */
function discoverDemoWallet(chainInfo, onWalletDiscovered, timeoutMs) {
  let cancelled = false;
  let cleanup = () => {};
  const walletOrigin = new URL(DEMO_WALLET_URL).origin;
  const iframe = document.createElement("iframe");
  iframe.src = DEMO_WALLET_URL;
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
          reject(new Error("Demo Wallet iframe did not expose a window"));
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
          reject(new Error("Demo Wallet discovery response did not include wallet info"));
          return;
        }
        onWalletDiscovered(
          new IframeWalletProvider(info.id, info.name, info.icon, DEMO_WALLET_URL, chainInfo),
        );
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

export async function initiateConnection(provider) {
  return provider.establishSecureChannel(APP_ID);
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
