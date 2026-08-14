import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";

/** HappyVote storage layout (must match codegen `HappyVoteContract.storage`). */
const STORAGE_SLOTS = {
  privacy_policy: 3n,
  tally: 6n,
  total_votes: 7n,
  vote_ended: 8n,
  sealed: 13n,
  starts_at: 14n,
  ends_at: 15n,
  cancelled: 16n,
  /** Contract-level PublicMutable, not a per-poll map. */
  paused: 18n,
};

function asFieldBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (value && typeof value === "object") {
    if (typeof value.toBigInt === "function") return value.toBigInt();
    if (typeof value.asBigInt === "bigint") return value.asBigInt;
    if ("value" in value) return asFieldBigInt(value.value);
  }
  throw new Error(`Cannot coerce field: ${value}`);
}

function isRateLimited(error) {
  const msg = error?.message || String(error);
  return msg.includes("429") || /rate limit/i.test(msg);
}

async function withRetry(fn, { attempts = 5, label = "rpc" } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRateLimited(error) || i === attempts - 1) throw error;
      const delayMs = 1000 * 2 ** i;
      console.warn(`${label} rate-limited, retry in ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

function asNumber(value) {
  return Number(asFieldBigInt(value));
}

/**
 * Closed by admin end, cancel, or scheduled ends_at (unix seconds).
 */
export function isPollClosedAt(voteEnded, cancelled, endsAt, nowSec) {
  return Boolean(voteEnded || cancelled || (endsAt !== 0 && nowSec >= endsAt));
}

/**
 * Read public poll tallies / policy via node storage (no wallet).
 * @param {{ nodeUrl: string, contractAddress: string, pollId: number|string|bigint, optionsCount: number }} args
 */
export async function fetchPublicPollState({
  nodeUrl,
  contractAddress,
  pollId,
  optionsCount,
}) {
  if (!nodeUrl) throw new Error("nodeUrl is required");
  if (!contractAddress) throw new Error("contractAddress is required");
  if (!Number.isInteger(optionsCount) || optionsCount < 1) {
    throw new Error(`Invalid optionsCount: ${optionsCount}`);
  }

  const address = AztecAddress.fromStringUnsafe(String(contractAddress));
  const pollField = Fr.fromString(String(pollId));
  const pollKey = { toField: () => pollField };
  const node = createAztecNodeClient(nodeUrl);

  const tallyRoot = await deriveStorageSlotInMap(new Fr(STORAGE_SLOTS.tally), pollKey);
  const optionSlots = await Promise.all(
    Array.from({ length: optionsCount }, (_, i) =>
      deriveStorageSlotInMap(tallyRoot, { toField: () => new Fr(i) }),
    ),
  );
  const [
    totalSlot,
    policySlot,
    voteEndedSlot,
    sealedSlot,
    startsAtSlot,
    endsAtSlot,
    cancelledSlot,
  ] = await Promise.all([
    deriveStorageSlotInMap(new Fr(STORAGE_SLOTS.total_votes), pollKey),
    deriveStorageSlotInMap(new Fr(STORAGE_SLOTS.privacy_policy), pollKey),
    deriveStorageSlotInMap(new Fr(STORAGE_SLOTS.vote_ended), pollKey),
    deriveStorageSlotInMap(new Fr(STORAGE_SLOTS.sealed), pollKey),
    deriveStorageSlotInMap(new Fr(STORAGE_SLOTS.starts_at), pollKey),
    deriveStorageSlotInMap(new Fr(STORAGE_SLOTS.ends_at), pollKey),
    deriveStorageSlotInMap(new Fr(STORAGE_SLOTS.cancelled), pollKey),
  ]);

  const [
    optionValues,
    totalValue,
    policyValue,
    voteEndedValue,
    sealedValue,
    startsAtValue,
    endsAtValue,
    cancelledValue,
    pausedValue,
  ] = await withRetry(
    () =>
      Promise.all([
        Promise.all(
          optionSlots.map((slot) => node.getPublicStorageAt("latest", address, slot)),
        ),
        node.getPublicStorageAt("latest", address, totalSlot),
        node.getPublicStorageAt("latest", address, policySlot),
        node.getPublicStorageAt("latest", address, voteEndedSlot),
        node.getPublicStorageAt("latest", address, sealedSlot),
        node.getPublicStorageAt("latest", address, startsAtSlot),
        node.getPublicStorageAt("latest", address, endsAtSlot),
        node.getPublicStorageAt("latest", address, cancelledSlot),
        node.getPublicStorageAt("latest", address, new Fr(STORAGE_SLOTS.paused)),
      ]),
    { label: "getPublicStorageAt" },
  );

  const nowSec = Math.floor(Date.now() / 1000);
  const voteEnded = asNumber(voteEndedValue) !== 0;
  const sealed = asNumber(sealedValue) !== 0;
  const startsAt = asNumber(startsAtValue);
  const endsAt = asNumber(endsAtValue);
  const cancelled = asNumber(cancelledValue) !== 0;
  const paused = asNumber(pausedValue) !== 0;
  const closed = isPollClosedAt(voteEnded, cancelled, endsAt, nowSec);
  const hideTallies = sealed && !closed;
  const votingOpen =
    !paused && !closed && (startsAt === 0 || nowSec >= startsAt);

  return {
    tallies: hideTallies ? optionValues.map(() => 0) : optionValues.map(asNumber),
    total: hideTallies ? 0 : asNumber(totalValue),
    policy: asNumber(policyValue),
    sealed,
    voteEnded: voteEnded || cancelled || closed,
    cancelled,
    paused,
    startsAt,
    endsAt,
    votingOpen,
  };
}
