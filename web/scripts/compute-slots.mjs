/**
 * Precompute HappyVote public map slots (Poseidon2 deriveStorageSlotInMap).
 * Usage: node scripts/compute-slots.mjs [pollId] [optionsCount]
 */
import { Fr } from "@aztec/aztec.js/fields";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";

const pollId = process.argv[2] ?? "1";
const optionsCount = Number(process.argv[3] ?? "2");
if (!Number.isInteger(optionsCount) || optionsCount < 1 || optionsCount > 32) {
  throw new Error(`Invalid optionsCount: ${process.argv[3]}`);
}

// Slot indices from HappyVote.storage layout (codegen).
const BASE = {
  privacy_policy: 3n,
  tally: 6n,
  total_votes: 7n,
  vote_ended: 8n,
  sealed: 13n,
};
const pollKey = { toField: () => Fr.fromString(String(pollId)) };
const tallyRoot = await deriveStorageSlotInMap(new Fr(BASE.tally), pollKey);

const tallies = [];
for (let i = 0; i < optionsCount; i++) {
  tallies.push(
    (await deriveStorageSlotInMap(tallyRoot, { toField: () => new Fr(i) })).toString(),
  );
}

const result = {
  pollId: String(pollId),
  optionsCount,
  tallies,
  total: (await deriveStorageSlotInMap(new Fr(BASE.total_votes), pollKey)).toString(),
  policy: (await deriveStorageSlotInMap(new Fr(BASE.privacy_policy), pollKey)).toString(),
  voteEnded: (await deriveStorageSlotInMap(new Fr(BASE.vote_ended), pollKey)).toString(),
  sealed: (await deriveStorageSlotInMap(new Fr(BASE.sealed), pollKey)).toString(),
};

console.log(JSON.stringify(result, null, 2));
