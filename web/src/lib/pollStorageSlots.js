import { Fr } from "@aztec/aztec.js/fields";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";

/**
 * HappyVote public map bases (codegen storage layout).
 * Nested `tally` is map(poll_id → map(option_index → count)).
 */
export const POLL_MAP_SLOTS = {
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

/** Size of the guest-API migration fallback table only — not a poll-id cap. */
export const PRECOMPUTED_POLL_ID_MAX = 128;

/** Contract + guest API cap. */
export const MAX_POLL_OPTIONS = 32;

function asPollKey(pollId) {
  const id = typeof pollId === "bigint" ? pollId.toString() : String(pollId);
  return { toField: () => Fr.fromString(id) };
}

function slotHex(field) {
  return field.toString();
}

/**
 * Poseidon2 map slots for guest `/api/poll-state` (no wallet).
 * @param {number|string|bigint} pollId
 * @param {number} optionsCount
 */
export async function computePollStorageSlots(pollId, optionsCount) {
  if (!Number.isInteger(optionsCount) || optionsCount < 1 || optionsCount > MAX_POLL_OPTIONS) {
    throw new Error(`Invalid optionsCount: ${optionsCount}`);
  }
  const pollKey = asPollKey(pollId);
  const tallyRoot = await deriveStorageSlotInMap(new Fr(POLL_MAP_SLOTS.tally), pollKey);
  const tallies = [];
  for (let i = 0; i < optionsCount; i++) {
    tallies.push(
      slotHex(await deriveStorageSlotInMap(tallyRoot, { toField: () => new Fr(i) })),
    );
  }
  return {
    tallies,
    total: slotHex(await deriveStorageSlotInMap(new Fr(POLL_MAP_SLOTS.total_votes), pollKey)),
    policy: slotHex(await deriveStorageSlotInMap(new Fr(POLL_MAP_SLOTS.privacy_policy), pollKey)),
    voteEnded: slotHex(await deriveStorageSlotInMap(new Fr(POLL_MAP_SLOTS.vote_ended), pollKey)),
    sealed: slotHex(await deriveStorageSlotInMap(new Fr(POLL_MAP_SLOTS.sealed), pollKey)),
    startsAt: slotHex(await deriveStorageSlotInMap(new Fr(POLL_MAP_SLOTS.starts_at), pollKey)),
    endsAt: slotHex(await deriveStorageSlotInMap(new Fr(POLL_MAP_SLOTS.ends_at), pollKey)),
    cancelled: slotHex(await deriveStorageSlotInMap(new Fr(POLL_MAP_SLOTS.cancelled), pollKey)),
  };
}
