/**
 * Poseidon2 HappyVote public map slots.
 *
 *   node scripts/compute-slots.mjs [pollId] [optionsCount]
 *   node scripts/compute-slots.mjs --write [--max-poll 128] [--options 32]
 *
 * `--write` regenerates the migration fallback `data/precomputed-slots.json`
 * after a contract storage-layout change. Guest `/api/poll-state` reads slots
 * from catalog metadata published with each poll (any id).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computePollStorageSlots,
  MAX_POLL_OPTIONS,
  PRECOMPUTED_POLL_ID_MAX,
} from "../src/lib/pollStorageSlots.js";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "data", "precomputed-slots.json");

function parseArgs(argv) {
  const args = { write: false, maxPoll: PRECOMPUTED_POLL_ID_MAX, options: MAX_POLL_OPTIONS, pollId: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") args.write = true;
    else if (a === "--max-poll") args.maxPoll = Number(argv[++i]);
    else if (a === "--options") args.options = Number(argv[++i]);
    else rest.push(a);
  }
  if (!args.write) {
    args.pollId = rest[0] ?? "1";
    args.options = rest[1] != null ? Number(rest[1]) : 2;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!Number.isInteger(args.options) || args.options < 1 || args.options > MAX_POLL_OPTIONS) {
  throw new Error(`Invalid optionsCount: ${args.options}`);
}

if (args.write) {
  if (!Number.isInteger(args.maxPoll) || args.maxPoll < 1 || args.maxPoll > 1024) {
    throw new Error(`Invalid --max-poll: ${args.maxPoll}`);
  }
  const table = {};
  for (let pollId = 1; pollId <= args.maxPoll; pollId++) {
    table[String(pollId)] = await computePollStorageSlots(pollId, args.options);
  }
  writeFileSync(outPath, `${JSON.stringify(table, null, 2)}\n`);
  console.log(`Wrote ${args.maxPoll} polls × ${args.options} option slots → ${outPath}`);
} else {
  const result = await computePollStorageSlots(args.pollId, args.options);
  console.log(JSON.stringify({ pollId: String(args.pollId), optionsCount: args.options, ...result }, null, 2));
}
