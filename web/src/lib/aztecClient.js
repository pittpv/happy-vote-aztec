import { createAztecNodeClient, waitForTx } from "@aztec/aztec.js/node";
import { NO_WAIT } from "@aztec/aztec.js/contracts";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { TxStatus } from "@aztec/stdlib/tx";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts";
// IndexedDB: sqlite-opfs WASM worker init hangs in some Chromium embeds / after COEP.
import { openTmpStore } from "@aztec/kv-store/deprecated/indexeddb";
import { HappyVoteContract } from "../contracts/HappyVote.ts";
import { bbProverOptionsForBrowser } from "./browser.js";

/**
 * Browser-session prove uses one Barretenberg singleton. The first initSingleton
 * call wins, so this must pass the same iOS memory options as the PXE prover.
 * A failed warmup is discarded inside bb.js; the vote still proves on send().
 */
let browserProverWarmup;

export function warmBrowserProver() {
  if (import.meta.env.VITE_PROVER_ENABLED !== "true") return;
  if (browserProverWarmup) return;
  browserProverWarmup = (async () => {
    const { Barretenberg } = await import("@aztec/bb.js");
    await Barretenberg.initSingleton(bbProverOptionsForBrowser());
  })().catch((error) => {
    browserProverWarmup = undefined;
    console.error(error);
  });
}

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

/**
 * Browser-session voter account (initializerless Schnorr).
 * No on-chain constructor/deploy tx: the signing public key is committed in the
 * address via immutables_hash and materialized locally in the PXE.
 *
 * Do not use this for admin import — those keys belong to an already-initialized
 * `createSchnorrAccount` contract. External wallets keep their own account type.
 */
export async function createSessionAccount(wallet, { onProgress } = {}) {
  if (typeof wallet.createSchnorrInitializerlessAccount !== "function") {
    throw new Error(
      "This Aztec wallet build is missing createSchnorrInitializerlessAccount. Pin @aztec/wallets to 5.1.0 or newer.",
    );
  }

  const { Fr: Field } = await import("@aztec/aztec.js/fields");
  const { GrumpkinScalar } = await import("@aztec/foundation/curves/grumpkin");

  onProgress?.("Generating Schnorr keys…");
  const secretKey = Field.random();
  const signingKey = GrumpkinScalar.random();
  const salt = Field.random();

  onProgress?.("Creating voter account (no on-chain deploy)…");
  const account = await wallet.createSchnorrInitializerlessAccount(secretKey, salt, signingKey);
  if (!account?.address) {
    throw new Error("Initializerless account was created without an address");
  }

  onProgress?.("Registering Sponsored FPC…");
  const sponsoredFPC = await getSponsoredFpc(wallet);
  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

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

function gasFeeFromBlock(block, blockNumber) {
  const fees = block?.header?.globalVariables?.gasFees;
  if (!fees) {
    throw new Error(`Block ${blockNumber} is missing gasFees`);
  }
  return {
    feePerDaGas: asFieldBigInt(fees.feePerDaGas),
    feePerL2Gas: asFieldBigInt(fees.feePerL2Gas),
  };
}

/**
 * Return when the ballot is in a proposed L2 block.
 * The default wait is checkpointed, which holds until the block is published to L1.
 * EmbeddedWallet already upgrades an omitted status to proposed; external wallets do not.
 */
export const voteInclusionWait = {
  timeout: 600,
  waitForStatus: TxStatus.PROPOSED,
};

/**
 * Submit a proven ballot, then wait until it is in a proposed L2 block.
 * `onStep` runs after the proof is submitted, before the inclusion wait.
 */
export async function submitProvenBallot(method, { from, txOptions, onStep }) {
  if (!method?.send) throw new Error("Ballot method is required");
  if (!from) throw new Error("Account address is required");
  if (!txOptions) throw new Error("Sponsored fee options are required");
  if (typeof onStep !== "function") throw new Error("Ballot progress callback is required");

  const sent = await method.send({
    from,
    ...txOptions,
    wait: NO_WAIT,
  });
  const txHash = sent?.txHash ?? sent?.hash ?? sent;
  if (txHash == null || txHash === "") {
    throw new Error("Vote send did not return a transaction hash");
  }

  onStep({
    button: "Waiting for block…",
    text: "The ballot is on the network. Waiting until it is in a proposed L2 block.",
  });
  const receipt = await waitForTx(createAztecNodeClient(getNodeUrl()), txHash, voteInclusionWait);
  return { receipt, txHash };
}

/** Reuse a recent 2× fee cap so a vote click does not wait on two block RPCs. */
const SPONSORED_FEE_TTL_MS = 60_000;
let sponsoredFeeCache = null;

/**
 * Fee options for vote (and other) txs paid by the Testnet Sponsored FPC.
 * Caps maxFeesPerGas at 2× the latest block so a long prove does not lose a
 * base-fee race (Azguard then reports "Tx dropped by P2P node").
 *
 * Do not pass the FPC address as additionalScopes. Azguard (dapp hardening,
 * 2026-09-29) allows that list only for accounts in the connected session and
 * rejects anything else with "Unauthorized scope: 0x130925fb…".
 * sponsor_unconditionally only sets the fee payer; it does not read the FPC's
 * private notes, so the sender account is the only scope the ballot needs.
 */
export async function sponsoredTxOptions(paymentMethod) {
  if (!paymentMethod) {
    throw new Error("Sponsored fee payment method is required");
  }
  const now = Date.now();
  let maxFeesPerGas = null;
  if (sponsoredFeeCache && now - sponsoredFeeCache.at < SPONSORED_FEE_TTL_MS) {
    maxFeesPerGas = sponsoredFeeCache.maxFeesPerGas;
  } else {
    const node = createAztecNodeClient(getNodeUrl());
    const blockNumber = await node.getBlockNumber();
    const block = await node.getBlock(blockNumber);
    if (!block) {
      throw new Error(`Aztec node did not return block ${blockNumber}`);
    }
    const { feePerDaGas, feePerL2Gas } = gasFeeFromBlock(block, blockNumber);
    if (feePerL2Gas === 0n) {
      throw new Error(`Block ${blockNumber} reported a zero L2 base fee`);
    }
    maxFeesPerGas = {
      feePerDaGas: feePerDaGas * 2n,
      feePerL2Gas: feePerL2Gas * 2n,
    };
    sponsoredFeeCache = { at: now, maxFeesPerGas };
  }
  return {
    fee: {
      paymentMethod,
      gasSettings: { maxFeesPerGas },
    },
  };
}

/**
 * One registration per wallet address for the life of the page.
 * Opening another poll must not upload artifacts or re-simulate views.
 */
let voteSessionGeneration = 0;
const readyVoteSessions = new Map();
const pendingVoteSessions = new Map();

export function peekVoteSession(address) {
  if (!address) return null;
  return readyVoteSessions.get(String(address)) ?? null;
}

export function clearVoteSession() {
  voteSessionGeneration += 1;
  readyVoteSessions.clear();
  pendingVoteSessions.clear();
}

export function prepareVoteSession(wallet, from) {
  if (!wallet) throw new Error("Wallet is required");
  if (!from) throw new Error("Account address is required");
  const key = from.toString();
  const ready = readyVoteSessions.get(key);
  if (ready) return Promise.resolve(ready);
  const pending = pendingVoteSessions.get(key);
  if (pending) return pending;

  const generation = voteSessionGeneration;
  const task = (async () => {
    await registerStandardContracts(wallet);
    if (generation !== voteSessionGeneration) return null;
    const paymentMethod = await getSponsoredPaymentMethod(wallet);
    if (generation !== voteSessionGeneration) return null;
    const contract = await registerHappyVote(wallet);
    if (generation !== voteSessionGeneration) return null;
    const session = { contract, paymentMethod };
    readyVoteSessions.set(key, session);
    pendingVoteSessions.delete(key);
    // Warm the fee cap. A failure here must not fail registration; vote() fetches again.
    void sponsoredTxOptions(paymentMethod).catch((error) => {
      console.error(error);
    });
    return session;
  })();

  pendingVoteSessions.set(key, task);
  return task.catch((error) => {
    if (pendingVoteSessions.get(key) === task) pendingVoteSessions.delete(key);
    throw error;
  });
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
export async function readPublicPollState(pollId, optionsCount, { fresh = false } = {}) {
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
    if (fresh) qs.set("fresh", "1");
    const response = await fetch(`/api/poll-state?${qs}`, fresh ? { cache: "no-store" } : undefined);
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

/** One wallet simulation per tally. The vote page reads public storage in one request instead. */
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
