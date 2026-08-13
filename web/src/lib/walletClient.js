import { Fr } from "@aztec/aztec.js/fields";
import { WalletManager } from "@aztec/wallet-sdk/manager";
import { hashToEmoji } from "@aztec/wallet-sdk/crypto";
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
 * Discover only the chosen source so extension approval prompts fire after the user picks.
 * @param {"extension" | "web"} choice
 */
export function discoverWallets(chainInfo, onWalletDiscovered, choice, timeoutMs = 10_000) {
  return WalletManager.configure({
    extensions: { enabled: choice === "extension" },
    webWallets: { urls: choice === "web" ? [DEMO_WALLET_URL] : [] },
  }).getAvailableWallets({
    chainInfo,
    appId: APP_ID,
    timeout: timeoutMs,
    onWalletDiscovered,
  });
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
