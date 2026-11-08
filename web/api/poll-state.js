/**
 * Lightweight public tallies API (no aztec.js runtime).
 * Uses raw JSON-RPC + HappyVote map slots (Poseidon2).
 *
 * Slots are catalog metadata written at publish (any poll id). A baked JSON
 * file is only a fallback for older records. Do NOT import @aztec-labs/* here —
 * this route stays on raw JSON-RPC.
 */
import { loadMergedCatalog } from "./poll-catalog.js";
import { readNextPollId } from "./polls.js";
import { resolvePollSlots } from "./poll-slots.js";
import { scheduleEnded } from "../src/lib/pollSchedule.js";

const DEFAULT_NODE = "https://aztec-testnet.drpc.org";
const CACHE_TTL_MS = 15_000;
/** Contract-level `paused` PublicMutable (codegen slot 18), not a per-poll map. */
const PAUSED_SLOT = "0x12";

/** @type {{ key: string, at: number, data: object } | null} */
let memoryCache = null;

/** @type {{ key: string, at: number, data: object } | null} */
let catalogClosureCache = null;

const CLOSURE_KEYS = ["voteEnded", "cancelled", "startsAt", "endsAt"];

function env(name) {
  const value = process.env[name];
  if (value == null || value === "") return null;
  return value;
}

function padHex32(hex) {
  const h = String(hex).replace(/^0x/i, "").toLowerCase();
  return `0x${h.padStart(64, "0")}`;
}

function low64Number(value) {
  let raw = value;
  if (raw && typeof raw === "object" && "value" in raw) raw = raw.value;
  if (raw == null || raw === "" || raw === "0x") return 0;
  const n = typeof raw === "bigint" ? raw : BigInt(raw);
  return Number(n & ((1n << 64n) - 1n));
}

function fieldToNumber(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    if (value === "0x" || value === "") return 0;
    return Number(BigInt(value));
  }
  if (typeof value === "object") {
    if (typeof value.value === "string" || typeof value.value === "number") {
      return fieldToNumber(value.value);
    }
  }
  throw new Error(`Unexpected storage value: ${JSON.stringify(value)}`);
}

function fieldToHex(value) {
  let raw = value;
  if (raw && typeof raw === "object" && "value" in raw) raw = raw.value;
  if (raw == null || raw === "" || raw === "0x") return padHex32("0");
  const hex = typeof raw === "bigint" ? raw.toString(16) : String(raw);
  return padHex32(hex);
}

async function withSealSlots(pollId, slots) {
  if (slots.sealedBallots && slots.sealedCounted && slots.recipient) return slots;
  const { computePollStorageSlots } = await import("../src/lib/pollStorageSlots.js");
  const computed = await computePollStorageSlots(pollId, 2);
  return {
    ...slots,
    sealedBallots: slots.sealedBallots || computed.sealedBallots,
    sealedCounted: slots.sealedCounted || computed.sealedCounted,
    recipient: slots.recipient || computed.recipient,
  };
}

async function rpcBatch(nodeUrl, calls) {
  // dRPC's free Testnet plan rejects JSON-RPC batches larger than 3.
  const out = [];
  for (let offset = 0; offset < calls.length; offset += 3) {
    const part = await rpcBatchOnce(nodeUrl, calls.slice(offset, offset + 3));
    out.push(...part);
  }
  return out;
}

async function rpcBatchOnce(nodeUrl, calls) {
  const body = calls.map((c, i) => ({
    jsonrpc: "2.0",
    id: i + 1,
    method: c.method,
    params: c.params,
  }));
  const response = await fetch(nodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`RPC non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok && !Array.isArray(json)) {
    throw new Error(json?.message || `HTTP ${response.status}`);
  }
  if (!Array.isArray(json)) {
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
    throw new Error("Expected JSON-RPC batch array");
  }
  return json
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((item) => {
      if (item.error) {
        throw new Error(item.error.message || JSON.stringify(item.error));
      }
      return item.result;
    });
}

async function withRetry(fn, attempts = 5) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      const msg = error?.message || String(error);
      if (!/429|rate limit/i.test(msg) || i === attempts - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw last;
}

function requireStorageNumber(value, label) {
  if (value == null || value === "") {
    throw new Error(`Missing storage value for ${label}`);
  }
  return fieldToNumber(value);
}

/**
 * On-chain open/ended flags for every poll in the shared catalog.
 * Cards cannot use catalog `endsAt` alone: admin `end_poll` sets `vote_ended`
 * without writing a catalog end time.
 */
export async function loadCatalogClosure({ contractAddress, nodeUrl }) {
  if (!contractAddress) throw new Error("VITE_HAPPY_VOTE_CONTRACT_ADDRESS is not set");
  if (!nodeUrl) throw new Error("VITE_AZTEC_NODE_URL is not configured");

  const catalog = await loadMergedCatalog();
  const nextPollId = await readNextPollId();
  const now = Date.now();
  const polls = Object.values(catalog.polls || {})
    .filter((poll) => Number(poll?.id) > 0 && Number(poll.id) < nextPollId)
    .filter((poll) => !scheduleEnded(poll, now))
    .sort((a, b) => Number(a.id) - Number(b.id));

  const contract = padHex32(contractAddress);
  const calls = [];
  const index = [];
  for (const poll of polls) {
    const optionCount = Array.isArray(poll.options) ? poll.options.length : 0;
    if (optionCount < 1) throw new Error(`Poll ${poll.id} has no options`);
    const slots = resolvePollSlots(String(poll.id), poll.storageSlots, optionCount);
    if (!slots) throw new Error(`Poll ${poll.id} storage slots are missing`);
    for (const key of CLOSURE_KEYS) {
      calls.push({
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots[key])],
      });
      index.push({ id: String(poll.id), key });
    }
  }
  calls.push({
    method: "node_getPublicStorageAt",
    params: ["latest", contract, padHex32(PAUSED_SLOT)],
  });

  const results = await withRetry(() => rpcBatch(nodeUrl, calls));
  if (results.length !== calls.length) {
    throw new Error("Short storage read for catalog poll status");
  }

  const paused = requireStorageNumber(results[results.length - 1], "paused") !== 0;
  /** @type {Record<string, Record<string, number>>} */
  const raw = {};
  for (let i = 0; i < index.length; i++) {
    const { id, key } = index[i];
    if (!raw[id]) raw[id] = {};
    raw[id][key] = requireStorageNumber(results[i], `poll ${id} ${key}`);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  /** @type {Record<string, { closed: boolean, cancelled: boolean, paused: boolean, startsAt: number, endsAt: number, votingOpen: boolean }>} */
  const out = {};
  for (const [id, row] of Object.entries(raw)) {
    const cancelled = row.cancelled !== 0;
    const startsAt = row.startsAt;
    const endsAt = row.endsAt;
    const closed = row.voteEnded !== 0 || cancelled || (endsAt !== 0 && nowSec >= endsAt);
    out[id] = {
      closed,
      cancelled,
      paused,
      startsAt,
      endsAt,
      votingOpen: !paused && !closed && (startsAt === 0 || nowSec >= startsAt),
    };
  }
  return { polls: out };
}

async function resolveSlots(pollId, optionsCount) {
  const id = String(pollId);
  const catalog = await loadMergedCatalog();
  const slots = resolvePollSlots(id, catalog.polls?.[id]?.storageSlots, optionsCount);
  if (slots) return slots;
  console.error("poll-state missing slots", { pollId: id, optionsCount });
  throw new Error("Poll tallies are unavailable");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const contractAddress = env("VITE_HAPPY_VOTE_CONTRACT_ADDRESS");
    if (!contractAddress) {
      res.status(500).json({ error: "VITE_HAPPY_VOTE_CONTRACT_ADDRESS is not set" });
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const nodeUrl = env("VITE_AZTEC_NODE_URL") || DEFAULT_NODE;
    const fresh = url.searchParams.get("fresh") === "1";
    const now = Date.now();

    if (url.searchParams.get("catalog") === "1") {
      const cacheKey = `catalog:${contractAddress}`;
      if (
        !fresh &&
        catalogClosureCache &&
        catalogClosureCache.key === cacheKey &&
        now - catalogClosureCache.at < CACHE_TTL_MS
      ) {
        res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
        res.setHeader("X-Cache", "HIT");
        res.status(200).json(catalogClosureCache.data);
        return;
      }
      const data = await loadCatalogClosure({ contractAddress, nodeUrl });
      catalogClosureCache = { key: cacheKey, at: now, data };
      if (fresh) {
        res.setHeader("Cache-Control", "no-store");
      } else {
        res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
      }
      res.setHeader("X-Cache", fresh ? "BYPASS" : "MISS");
      res.status(200).json(data);
      return;
    }

    const pollId = url.searchParams.get("pollId") ?? env("VITE_DEFAULT_POLL_ID") ?? "1";
    const optionsCount = Number(url.searchParams.get("optionsCount") ?? "2");
    if (!Number.isInteger(optionsCount) || optionsCount < 1 || optionsCount > 32) {
      res.status(400).json({ error: `Invalid optionsCount` });
      return;
    }

    const cacheKey = `${contractAddress}:${pollId}:${optionsCount}`;
    if (!fresh && memoryCache && memoryCache.key === cacheKey && now - memoryCache.at < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
      res.setHeader("X-Cache", "HIT");
      res.status(200).json(memoryCache.data);
      return;
    }

    const nextPollId = await readNextPollId();
    if (!(Number(pollId) > 0 && Number(pollId) < nextPollId)) {
      res.status(404).json({ error: "Poll is not on this contract" });
      return;
    }

    const slots = await withSealSlots(pollId, await resolveSlots(pollId, optionsCount));
    const contract = padHex32(contractAddress);

    const calls = [
      ...slots.tallies.map((slot) => ({
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slot)],
      })),
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots.total)],
      },
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots.policy)],
      },
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots.voteEnded)],
      },
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots.sealed)],
      },
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots.startsAt)],
      },
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots.endsAt)],
      },
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots.cancelled)],
      },
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(PAUSED_SLOT)],
      },
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots.sealedBallots)],
      },
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots.sealedCounted)],
      },
      {
        method: "node_getPublicStorageAt",
        params: ["latest", contract, padHex32(slots.recipient)],
      },
    ];

    const results = await withRetry(() => rpcBatch(nodeUrl, calls));
    const tallyResults = results.slice(0, optionsCount);
    const totalValue = results[optionsCount];
    const policyValue = results[optionsCount + 1];
    const voteEndedFlag = fieldToNumber(results[optionsCount + 2]) !== 0;
    const sealedFlags = fieldToNumber(results[optionsCount + 3]);
    const sealed = (sealedFlags & 1) !== 0;
    const startsAt = fieldToNumber(results[optionsCount + 4]);
    const endsAt = fieldToNumber(results[optionsCount + 5]);
    const cancelled = fieldToNumber(results[optionsCount + 6]) !== 0;
    const paused = fieldToNumber(results[optionsCount + 7]) !== 0;
    const sealedBallots = fieldToNumber(results[optionsCount + 8]);
    const sealedCounted = fieldToNumber(results[optionsCount + 9]);
    const tallyRecipient = fieldToHex(results[optionsCount + 10]);
    let poolRemaining;
    if (slots.poolRemaining) {
      const poolValue = await withRetry(() =>
        rpcBatch(nodeUrl, [
          {
            method: "node_getPublicStorageAt",
            params: ["latest", contract, padHex32(slots.poolRemaining)],
          },
        ]),
      );
      poolRemaining = low64Number(poolValue[0]);
    }
    const voteFrequency = (sealedFlags >> 1) & 1;
    const nowSec = Math.floor(Date.now() / 1000);
    const closed =
      voteEndedFlag || cancelled || (endsAt !== 0 && nowSec >= endsAt);
    const hideTallies = sealed && sealedBallots !== sealedCounted;
    const votingOpen =
      !paused && !closed && (startsAt === 0 || nowSec >= startsAt);

    const data = {
      tallies: hideTallies ? tallyResults.map(() => 0) : tallyResults.map(fieldToNumber),
      total: hideTallies ? 0 : fieldToNumber(totalValue),
      policy: fieldToNumber(policyValue),
      sealed,
      voteEnded: closed,
      cancelled,
      paused,
      startsAt,
      endsAt,
      voteFrequency,
      votingOpen,
      sealedBallots,
      sealedCounted,
      tallyRecipient,
      ...(poolRemaining == null ? {} : { poolRemaining }),
    };

    memoryCache = { key: cacheKey, at: now, data };
    if (fresh) {
      res.setHeader("Cache-Control", "no-store");
    } else {
      res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    }
    res.setHeader("X-Cache", fresh ? "BYPASS" : "MISS");
    res.status(200).json(data);
  } catch (error) {
    console.error("poll-state", error);
    res.status(502).json({ error: error?.message || String(error) });
  }
}
