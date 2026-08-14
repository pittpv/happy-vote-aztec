import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts";
// IndexedDB: sqlite-opfs WASM worker init hangs in some Chromium embeds / after COEP.
import { openTmpStore } from "@aztec/kv-store/deprecated/indexeddb";
import { HappyVoteContract } from "../contracts/HappyVote.ts";
import { bbProverOptionsForBrowser } from "./browser.js";

/** WaitOpts.timeout is seconds. Config values may be ms. */
function waitTimeoutSeconds(raw = 600_000) {
  return raw > 10_000 ? Math.ceil(raw / 1000) : raw;
}

export const PRIVACY = {
  PRIVATE_ONLY: 0,
  PUBLIC_ONLY: 1,
  VOTER_CHOICE: 2,
};

export const ELIGIBILITY = {
  OPEN: 0,
  PERSONHOOD: 1,
  GATED: 2,
};

const DEFAULT_NODE =
  import.meta.env.VITE_AZTEC_NODE_URL || "http://localhost:8080";

const SPONSORED_FPC =
  import.meta.env.VITE_SPONSORED_FPC_ADDRESS ||
  // Local network default from protocol; override via env on testnet
  "0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296";

export function getNodeUrl() {
  return DEFAULT_NODE;
}

export function getSponsoredFpcAddress() {
  return AztecAddress.fromStringUnsafe(String(SPONSORED_FPC));
}

export function getContractAddress() {
  const raw = import.meta.env.VITE_HAPPY_VOTE_CONTRACT_ADDRESS;
  if (!raw) return null;
  return AztecAddress.fromStringUnsafe(String(raw));
}

export function getDefaultPollId() {
  const raw = import.meta.env.VITE_DEFAULT_POLL_ID ?? "1";
  return pollIdFromRaw(raw);
}

/** Build `{ id: Fr }` from a decimal/hex poll id string. */
export function pollIdFromRaw(raw) {
  if (raw == null || String(raw) === "") {
    throw new Error("poll id is required");
  }
  return { id: Fr.fromString(String(raw)) };
}

export async function createWallet({ proverEnabled = false, onProgress } = {}) {
  onProgress?.("Opening local PXE (IndexedDB)…");
  const node = createAztecNodeClient(getNodeUrl());
  const [{ STANDARD_HANDSHAKE_REGISTRY_ADDRESS }, { STANDARD_AUTH_REGISTRY_ADDRESS }] =
    await Promise.all([
      import("@aztec/standard-contracts/handshake-registry/constants"),
      import("@aztec/standard-contracts/auth-registry/constants"),
    ]);
  // Browser EmbeddedWallet defaults to sqlite-opfs for both PXE and wallet DB.
  // That worker's WASM init can hang indefinitely in production; IndexedDB works.
  const pxeStore = await openTmpStore(true);
  const walletStore = await openTmpStore(true);
  const bbOptions = bbProverOptionsForBrowser();
  onProgress?.(
    bbOptions.threads === 1
      ? "Starting wallet (iPhone: single-thread prover)…"
      : "Starting wallet…",
  );
  return EmbeddedWallet.create(node, {
    ephemeral: true,
    pxeConfig: { proverEnabled },
    pxeOptions: {
      store: pxeStore,
      proverOrOptions: bbOptions,
      // External wallets often lack this hook; session PXE must allow HandshakeRegistry /
      // AuthRegistry reads used by SingleUseClaim during cast_vote_*. Only whitelist those
      // standard addresses — never authorize arbitrary contract utility calls.
      hooks: {
        authorizeUtilityCall: async (request) => {
          if (
            request.target.equals(STANDARD_HANDSHAKE_REGISTRY_ADDRESS) ||
            request.target.equals(STANDARD_AUTH_REGISTRY_ADDRESS)
          ) {
            return { authorized: true };
          }
          return {
            authorized: false,
            reason: `Unauthorized utility call to ${request.target}:${request.functionName}`,
          };
        },
      },
    },
    walletDb: { store: walletStore },
  });
}

export async function deployAccount(wallet, { onProgress } = {}) {
  const { Fr: Field } = await import("@aztec/aztec.js/fields");
  const { GrumpkinScalar } = await import("@aztec/foundation/curves/grumpkin");
  const { NO_FROM } = await import("@aztec/aztec.js/account");

  onProgress?.("Generating Schnorr keys…");
  const secretKey = Field.random();
  const signingKey = GrumpkinScalar.random();
  const salt = Field.random();
  const account = await wallet.createSchnorrAccount(secretKey, salt, signingKey);

  onProgress?.("Registering Sponsored FPC…");
  const sponsoredFPC = await getSponsoredFpc(wallet);
  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);
  const deployMethod = await account.getDeployMethod();

  onProgress?.("Simulating account deploy…");
  await deployMethod.simulate({ from: NO_FROM });

  onProgress?.(
    "Proving & submitting account deploy (first time downloads keys; often 2–10 min)…",
  );
  await deployMethod.send({
    from: NO_FROM,
    fee: { paymentMethod },
    wait: { timeout: waitTimeoutSeconds(600_000) },
  });

  return { account, paymentMethod, keys: { secretKey, salt, signingKey } };
}

/**
 * Import an existing Schnorr account (e.g. contract admin) from SECRET_KEY / SIGNING_KEY / SALT.
 * Keys are used only in-memory for this wallet session — never logged or persisted by this helper.
 *
 * Default: never re-broadcast account deploy. Admin keys from .env are already initialized;
 * `node.getContract` is unreliable for accounts on some RPCs, and a second init hits
 * "Invalid tx: Existing nullifier". Set `forceDeploy: true` only for never-deployed keys.
 */
export async function importAccount(wallet, rawKeys, { onProgress, forceDeploy = false } = {}) {
  if (!rawKeys?.secretKey || !rawKeys?.signingKey || !rawKeys?.salt) {
    throw new Error("secretKey, signingKey, and salt are all required");
  }

  const { Fr: Field } = await import("@aztec/aztec.js/fields");
  const { GrumpkinScalar } = await import("@aztec/foundation/curves/grumpkin");
  const { NO_FROM } = await import("@aztec/aztec.js/account");

  const secretKey = Field.fromString(String(rawKeys.secretKey).trim());
  const signingKey = GrumpkinScalar.fromString(String(rawKeys.signingKey).trim());
  const salt = Field.fromString(String(rawKeys.salt).trim());

  onProgress?.("Importing Schnorr account into local PXE…");
  const account = await wallet.createSchnorrAccount(secretKey, salt, signingKey);
  const short = account.address.toString().slice(0, 12);

  onProgress?.("Registering Sponsored FPC…");
  const sponsoredFPC = await getSponsoredFpc(wallet);
  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

  if (!forceDeploy) {
    onProgress?.(
      `Imported ${short}… — skip deploy (reuse on-chain account; avoids Existing nullifier)`,
    );
    return { account, paymentMethod, imported: true };
  }

  const node = createAztecNodeClient(getNodeUrl());
  let existing = null;
  try {
    existing = await node.getContract(account.address);
  } catch {
    existing = null;
  }
  if (existing) {
    onProgress?.(`Account on-chain · ${short}… — skip deploy`);
    return { account, paymentMethod, imported: true };
  }

  onProgress?.("Account not found on-chain — deploying…");
  try {
    const deployMethod = await account.getDeployMethod();
    await deployMethod.simulate({ from: NO_FROM });
    await deployMethod.send({
      from: NO_FROM,
      fee: { paymentMethod },
      wait: { timeout: waitTimeoutSeconds(600_000) },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/Existing nullifier/i.test(msg)) {
      onProgress?.(`Init nullifier already on-chain · ${short}… — continuing`);
      return { account, paymentMethod, imported: true };
    }
    throw error;
  }

  return { account, paymentMethod, imported: true };
}

async function getSponsoredFpc(wallet) {
  const address = AztecAddress.fromStringUnsafe(SPONSORED_FPC);
  const instance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContractArtifact,
    { salt: new Fr(0) },
  );
  await wallet.registerContract(
    { ...instance, address },
    SponsoredFPCContractArtifact,
  );
  return { ...instance, address };
}

/** Register Sponsored FPC + return fee payment method for testnet txs. */
export async function getSponsoredPaymentMethod(wallet) {
  const sponsoredFPC = await getSponsoredFpc(wallet);
  return new SponsoredFeePaymentMethod(sponsoredFPC.address);
}

/**
 * Register HappyVote from the node's published instance.
 * A reconstructed dummy instance (wrong salt / constructor args) makes PXE
 * simulate against an unpublished address → "Contract … is not deployed".
 */
export async function registerHappyVote(wallet) {
  const address = getContractAddress();
  if (!address) {
    throw new Error("VITE_HAPPY_VOTE_CONTRACT_ADDRESS is not set");
  }
  const node = createAztecNodeClient(getNodeUrl());
  const instance = await node.getContract(address);
  if (!instance) {
    throw new Error(`Contract not found on node: ${address}`);
  }
  await wallet.registerContract(instance, HappyVoteContract.artifact);
  return HappyVoteContract.at(address, wallet);
}

/**
 * SingleUseClaim / private entrypoints call HandshakeRegistry utilities.
 * External wallets won't have these preloaded unless we register them.
 */
export async function registerStandardContracts(wallet) {
  const [{ getStandardHandshakeRegistry }, { getStandardAuthRegistry }, { getStandardMultiCallEntrypoint }] =
    await Promise.all([
      import("@aztec/standard-contracts/handshake-registry/lazy"),
      import("@aztec/standard-contracts/auth-registry/lazy"),
      import("@aztec/standard-contracts/multi-call-entrypoint/lazy"),
    ]);

  const standards = await Promise.all([
    getStandardHandshakeRegistry(),
    getStandardAuthRegistry(),
    getStandardMultiCallEntrypoint(),
  ]);

  for (const { instance, artifact } of standards) {
    await wallet.registerContract(instance, artifact);
  }
}

export async function getContract(wallet, address) {
  return HappyVoteContract.at(address, wallet);
}

/**
 * Read public tallies / policy without a wallet.
 * Prefers same-origin `/api/poll-state` (server cache) so guests are not blocked by
 * public Aztec RPC rate limits; falls back to direct node storage reads.
 */
export async function readPublicPollState(pollId, optionsCount) {
  const address = getContractAddress();
  if (!address) {
    throw new Error("VITE_HAPPY_VOTE_CONTRACT_ADDRESS is not set");
  }
  if (!Number.isInteger(optionsCount) || optionsCount < 1) {
    throw new Error(`Invalid optionsCount: ${optionsCount}`);
  }

  const pollIdStr = pollId?.id != null ? String(asFieldBigInt(pollId.id)) : String(pollId);

  // Browser guests must use the cached same-origin API. Falling back to createAztecNodeClient
  // under failure floods sockets (ERR_INSUFFICIENT_RESOURCES) and hits public RPC rate limits.
  if (typeof window !== "undefined") {
    const qs = new URLSearchParams({
      pollId: pollIdStr,
      optionsCount: String(optionsCount),
    });
    const response = await fetch(`/api/poll-state?${qs}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data.tallies) || typeof data.total !== "number") {
      throw new Error("Invalid poll-state response");
    }
    return data;
  }

  const { fetchPublicPollState } = await import("./publicPollState.js");
  return fetchPublicPollState({
    nodeUrl: getNodeUrl(),
    contractAddress: address.toString(),
    pollId: pollIdStr,
    optionsCount,
  });
}

export async function readTallies(contract, pollId, optionsCount, from) {
  const tallies = [];
  for (let i = 0; i < optionsCount; i++) {
    const value = await contract.methods.get_tally(pollId, new Fr(i)).simulate({ from });
    tallies.push(Number(asFieldBigInt(value)));
  }
  const total = Number(
    asFieldBigInt(await contract.methods.get_total_votes(pollId).simulate({ from })),
  );
  return { tallies, total };
}

/** Coerce Aztec.js 5.x SimulationResult / Fr to bigint. */
export function asFieldBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error(`Cannot coerce array len=${value.length}`);
    return asFieldBigInt(value[0]);
  }
  if (value && typeof value === "object") {
    // SimulationResult wraps ABI return in `.result`
    if ("result" in value && typeof value.asBigInt !== "bigint") {
      return asFieldBigInt(value.result);
    }
    if (typeof value.asBigInt === "bigint") return value.asBigInt;
    if (typeof value.toBigInt === "function") return value.toBigInt();
    if ("value" in value) return asFieldBigInt(value.value);
  }
  throw new Error(`Cannot coerce tally: ${value}`);
}

export { HappyVoteContract, Fr, AztecAddress, SponsoredFeePaymentMethod };
