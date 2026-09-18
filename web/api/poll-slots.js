/**
 * Poseidon map slots for guest `/api/poll-state`.
 *
 * Source of truth: catalog `storageSlots` (written at publish).
 * `precomputed-slots.json` is only a migration fallback for records published
 * before that field existed. Guest API does not import @aztec/*.
 */
import PRECOMPUTED from "../data/precomputed-slots.json" with { type: "json" };

const SLOT_FIELDS = ["total", "policy", "voteEnded", "sealed", "startsAt", "endsAt", "cancelled"];

export function isUsableSlotEntry(entry, optionsCount) {
  if (!entry || !Array.isArray(entry.tallies) || entry.tallies.length < optionsCount) {
    return false;
  }
  return SLOT_FIELDS.every((key) => typeof entry[key] === "string" && entry[key].length > 0);
}

export function sliceSlots(entry, optionsCount) {
  return {
    tallies: entry.tallies.slice(0, optionsCount),
    total: entry.total,
    policy: entry.policy,
    voteEnded: entry.voteEnded,
    sealed: entry.sealed,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    cancelled: entry.cancelled,
  };
}

export function fallbackSlots(pollId, optionsCount) {
  const baked = PRECOMPUTED[String(pollId)];
  if (!isUsableSlotEntry(baked, optionsCount)) return null;
  return sliceSlots(baked, optionsCount);
}

/**
 * Catalog metadata first (any poll id). Fallback table only if the published
 * record predates storageSlots.
 */
export function resolvePollSlots(pollId, catalogSlots, optionsCount) {
  if (isUsableSlotEntry(catalogSlots, optionsCount)) {
    return sliceSlots(catalogSlots, optionsCount);
  }
  return fallbackSlots(pollId, optionsCount);
}
