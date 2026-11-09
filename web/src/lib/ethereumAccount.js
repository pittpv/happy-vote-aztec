import { Buffer } from "buffer";
import { Buffer32 } from "@aztec-labs/foundation/buffer";
import { Fr, Fq } from "@aztec-labs/foundation/curves/bn254";
import { keccak256 } from "@aztec-labs/foundation/crypto/keccak";
import { recoverAddress, normalizeSignature } from "@aztec-labs/foundation/crypto/secp256k1-signer";
import { Signature } from "@aztec-labs/foundation/eth-signature";
import { WalletUserRejectedError, isUserRejection } from "./walletErrors.js";

/**
 * Frozen sign-in message. Changing the wording, origin rule, or version opens
 * a different Aztec account. HappyVote does not send the Ethereum address or
 * this signature to its server.
 */
export const ETHEREUM_ACCOUNT_VERSION = 1;

const DOMAIN = "HAPPYVOTE_ETHEREUM_ACCOUNT_V1";
const DB_NAME = "happyvote-ethereum-account-v1";
const DB_STORE = "accounts";
const encoder = new TextEncoder();

function fail(message) {
  return new Error(message);
}

export function checkedEthereumAddress(value) {
  const address = String(value || "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || BigInt(address) === 0n) {
    throw fail("The Ethereum wallet returned an unusable address.");
  }
  return address.toLowerCase();
}

export function checkedPageOrigin(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw fail("This page has no usable address for an Ethereum account.");
  }
  if (!["https:", "http:"].includes(url.protocol) || url.origin !== value) {
    throw fail("This page has no usable address for an Ethereum account.");
  }
  return url.origin;
}

export function ethereumSignInMessage({ origin, address }) {
  const page = checkedPageOrigin(origin);
  const account = checkedEthereumAddress(address);
  return [
    "Create or open your private HappyVote account.",
    "",
    `Only sign this request on ${page}.`,
    "This signature is your account key. Do not share it.",
    "",
    `Ethereum account: ${account}`,
    `HappyVote account version: ${ETHEREUM_ACCOUNT_VERSION}`,
  ].join("\n");
}

export function ethereumSignDigest(message) {
  const body = Buffer.from(String(message), "utf8");
  const prefix = Buffer.from(`\x19Ethereum Signed Message:\n${body.length}`, "utf8");
  return Buffer32.fromBuffer(keccak256(Buffer.concat([prefix, body])));
}

function hexField(value) {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function bytesToBigInt(bytes) {
  let hex = "0x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return BigInt(hex);
}

/**
 * Canonical personal_sign bytes become the HKDF input. A different origin,
 * address, or message version derives a different account. Contract-wallet
 * signatures that do not recover the selected address are rejected.
 */
export async function deriveEthereumAccountKeys({
  message,
  signature,
  address,
  crypto = globalThis.crypto,
} = {}) {
  if (!crypto?.subtle) throw fail("This browser cannot derive an Ethereum account.");
  const expected = checkedEthereumAddress(address);
  if (typeof message !== "string" || message.length === 0 || message.length > 2048) {
    throw fail("The Ethereum account message is unusable.");
  }
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw fail("The Ethereum wallet returned an unusable signature.");
  }

  let canonicalBytes = null;
  try {
    const canonical = normalizeSignature(Signature.fromString(signature));
    const recovered = recoverAddress(ethereumSignDigest(message), canonical);
    if (recovered.toString().toLowerCase() !== expected) {
      throw fail("The signature does not match the selected Ethereum account.");
    }
    const r = canonical.r.toBuffer();
    const s = canonical.s.toBuffer();
    canonicalBytes = new Uint8Array(65);
    canonicalBytes.set(r, 0);
    canonicalBytes.set(s, 32);
    canonicalBytes[64] = canonical.v;
  } catch {
    throw fail(
      "The signature does not match the selected Ethereum account. A contract wallet cannot open this account.",
    );
  }

  try {
    const salt = await crypto.subtle.digest("SHA-256", encoder.encode(`${DOMAIN}\0${message}`));
    const key = await crypto.subtle.importKey("raw", canonicalBytes, "HKDF", false, ["deriveBits"]);
    const field = async (label, modulus) => {
      const derived = new Uint8Array(
        await crypto.subtle.deriveBits(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt,
            info: encoder.encode(`${DOMAIN}/${label}`),
          },
          key,
          256,
        ),
      );
      const reduced = (bytesToBigInt(derived) % (modulus - 1n)) + 1n;
      derived.fill(0);
      return reduced;
    };
    const secretKey = await field("secret-key", Fr.MODULUS);
    const accountSalt = await field("account-salt", Fr.MODULUS);
    const signingKey = await field("signing-key", Fq.MODULUS);
    return {
      secretKey: hexField(secretKey),
      salt: hexField(accountSalt),
      signingKey: hexField(signingKey),
    };
  } finally {
    canonicalBytes?.fill(0);
  }
}

function announceProvider(found, info, provider) {
  if (!info || typeof info.uuid !== "string" || !info.uuid || info.uuid.length > 128) return;
  if (typeof info.name !== "string" || !info.name.trim() || info.name.length > 128) return;
  if (typeof provider?.request !== "function") return;
  if (found.has(info.uuid) || [...found.values()].some((entry) => entry.provider === provider)) return;
  if (found.size >= 32) return;
  const icon =
    typeof info.icon === "string" &&
    info.icon.length < 131072 &&
    /^data:image\/(?:png|jpeg|webp|svg\+xml)[;,]/i.test(info.icon)
      ? info.icon
      : "";
  found.set(info.uuid, {
    id: info.uuid,
    name: info.name.trim(),
    icon,
    provider,
  });
}

export function discoverEthereumProviders({ windowRef = globalThis, timeoutMs = 400 } = {}) {
  if (typeof windowRef?.dispatchEvent !== "function") {
    return Promise.resolve([]);
  }
  const found = new Map();
  const onAnnounce = (event) => announceProvider(found, event?.detail?.info, event?.detail?.provider);
  windowRef.addEventListener("eip6963:announceProvider", onAnnounce);
  try {
    windowRef.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    windowRef.removeEventListener("eip6963:announceProvider", onAnnounce);
    throw fail("This browser could not look for Ethereum wallets.");
  }
  return new Promise((resolve) => {
    windowRef.setTimeout(() => {
      windowRef.removeEventListener("eip6963:announceProvider", onAnnounce);
      try {
        const phantom = windowRef.phantom?.ethereum;
        if (phantom?.isPhantom === true && typeof phantom.request === "function") {
          announceProvider(
            found,
            { uuid: "injected:phantom-ethereum", name: "Phantom", icon: "" },
            phantom,
          );
        }
      } catch {
        /* An unavailable injected namespace does not hide announced wallets. */
      }
      if (found.size === 0) {
        try {
          const legacy = windowRef.ethereum;
          if (typeof legacy?.request === "function") {
            announceProvider(found, { uuid: "legacy", name: "Browser wallet", icon: "" }, legacy);
          }
        } catch {
          /* A blocked legacy provider leaves the list empty. */
        }
      }
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

async function requestEthereumAddress(provider) {
  let accounts;
  try {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  } catch (error) {
    if (error?.code === 4001 || isUserRejection(error)) throw new WalletUserRejectedError(error);
    throw fail("The Ethereum wallet could not open an account.");
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw fail("The Ethereum wallet did not return an account.");
  }
  return checkedEthereumAddress(accounts[0]);
}

async function personalSign(provider, address, message) {
  const hex = `0x${Buffer.from(message, "utf8").toString("hex")}`;
  try {
    const signature = await provider.request({
      method: "personal_sign",
      params: [hex, address],
    });
    if (typeof signature !== "string") {
      throw fail("The Ethereum wallet returned an unusable signature.");
    }
    return signature;
  } catch (error) {
    if (error?.message === "The Ethereum wallet returned an unusable signature.") throw error;
    if (error?.code === 4001 || isUserRejection(error)) throw new WalletUserRejectedError(error);
    throw fail("The Ethereum wallet could not sign the account message.");
  }
}

function openAccountDb(indexedDB) {
  if (typeof indexedDB?.open !== "function") {
    throw fail("This browser cannot remember an Ethereum account.");
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(fail("This browser cannot remember an Ethereum account."));
  });
}

async function withStore(indexedDB, mode, operation) {
  const db = await openAccountDb(indexedDB);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode);
      const request = operation(tx.objectStore(DB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(fail("This browser cannot remember an Ethereum account."));
      tx.onabort = () => reject(fail("This browser cannot remember an Ethereum account."));
    });
  } finally {
    db.close();
  }
}

async function scopeKey(origin, address, crypto) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${DOMAIN}\0${checkedPageOrigin(origin)}\0${checkedEthereumAddress(address)}`),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function accountKeys(value) {
  if (!value || typeof value !== "object") throw fail("Saved Ethereum account is unusable.");
  for (const field of ["secretKey", "salt", "signingKey"]) {
    if (typeof value[field] !== "string" || !/^0x[0-9a-f]{64}$/.test(value[field])) {
      throw fail("Saved Ethereum account is unusable.");
    }
    const number = BigInt(value[field]);
    const modulus = field === "signingKey" ? Fq.MODULUS : Fr.MODULUS;
    if (number === 0n || number >= modulus) throw fail("Saved Ethereum account is unusable.");
  }
  return {
    secretKey: value.secretKey,
    salt: value.salt,
    signingKey: value.signingKey,
  };
}

export async function loadEthereumAccount(scope, { crypto = globalThis.crypto, indexedDB = globalThis.indexedDB } = {}) {
  if (!crypto?.subtle) throw fail("This browser cannot derive an Ethereum account.");
  const key = await scopeKey(scope.origin, scope.address, crypto);
  const additionalData = encoder.encode(
    JSON.stringify({
      version: ETHEREUM_ACCOUNT_VERSION,
      origin: checkedPageOrigin(scope.origin),
      address: checkedEthereumAddress(scope.address),
    }),
  );
  const record = await withStore(indexedDB, "readonly", (store) => store.get(key));
  if (record == null) return null;
  try {
    if (record.version !== ETHEREUM_ACCOUNT_VERSION || record.scope !== key) {
      throw fail("Saved Ethereum account is unusable.");
    }
    if (
      record.key?.type !== "secret" ||
      record.key.extractable !== false ||
      record.key.algorithm?.name !== "AES-GCM" ||
      record.key.algorithm.length !== 256
    ) {
      throw fail("Saved Ethereum account is unusable.");
    }
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: record.iv, additionalData },
        record.key,
        record.ciphertext,
      ),
    );
    try {
      return accountKeys(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)));
    } finally {
      plaintext.fill(0);
    }
  } catch {
    await withStore(indexedDB, "readwrite", (store) => store.delete(key));
    return null;
  }
}

export async function saveEthereumAccount(
  scope,
  keys,
  { crypto = globalThis.crypto, indexedDB = globalThis.indexedDB } = {},
) {
  if (!crypto?.subtle || typeof crypto.getRandomValues !== "function") {
    throw fail("This browser cannot remember an Ethereum account.");
  }
  const captured = accountKeys(keys);
  const keyId = await scopeKey(scope.origin, scope.address, crypto);
  const additionalData = encoder.encode(
    JSON.stringify({
      version: ETHEREUM_ACCOUNT_VERSION,
      origin: checkedPageOrigin(scope.origin),
      address: checkedEthereumAddress(scope.address),
    }),
  );
  const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(captured));
  let ciphertext;
  try {
    ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, aes, plaintext);
  } finally {
    plaintext.fill(0);
  }
  await withStore(indexedDB, "readwrite", (store) =>
    store.put(
      {
        version: ETHEREUM_ACCOUNT_VERSION,
        scope: keyId,
        key: aes,
        iv,
        ciphertext,
      },
      keyId,
    ),
  );
}

/**
 * Ask the selected EIP-1193 provider for its account, reuse a local key when
 * this origin already derived one, otherwise sign the frozen message.
 * The returned Ethereum address stays in the page. It is not a server record.
 */
export async function connectEthereumProvider(
  provider,
  { origin, onProgress, crypto = globalThis.crypto, indexedDB = globalThis.indexedDB } = {},
) {
  if (typeof provider?.request !== "function") {
    throw fail("This Ethereum wallet cannot sign an account message.");
  }
  onProgress?.("Waiting for the Ethereum wallet…");
  const address = await requestEthereumAddress(provider);
  const scope = { origin: checkedPageOrigin(origin), address };
  const saved = await loadEthereumAccount(scope, { crypto, indexedDB });
  if (saved) return { address, keys: saved };

  onProgress?.("Approve the signature in your Ethereum wallet. That signature is the account key.");
  const message = ethereumSignInMessage(scope);
  const signature = await personalSign(provider, address, message);
  const keys = await deriveEthereumAccountKeys({ message, signature, address, crypto });
  await saveEthereumAccount(scope, keys, { crypto, indexedDB });
  return { address, keys };
}
