/**
 * Lightweight public tallies API (no aztec.js runtime).
 * Uses raw JSON-RPC + HappyVote map slots (Poseidon2).
 *
 * Slots are catalog metadata written at publish (any poll id). A baked JSON
 * file is only a fallback for older records. Do NOT import @aztec/* here —
 * Vercel serverless lacks pino-pretty transport.
 */
import { loadMergedCatalog } from "./poll-catalog.js";
import { resolvePollSlots } from "./poll-slots.js";

const DEFAULT_NODE = "https://v5.testnet.rpc.aztec-labs.com";
const CACHE_TTL_MS = 15_000;
/** Contract-level `paused` PublicMutable (codegen slot 18), not a per-poll map. */
const PAUSED_SLOT = "0x12";

/** @type {{ key: string, at: number, data: object } | null} */
let memoryCache = null;

function env(name) {
  const value = process.env[name];
  if (value == null || value === "") return null;
  return value;
}

function padHex32(hex) {
  const h = String(hex).replace(/^0x/i, "").toLowerCase();
  return `0x${h.padStart(64, "0")}`;
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

async function rpcBatch(nodeUrl, calls) {
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
    const pollId = url.searchParams.get("pollId") ?? env("VITE_DEFAULT_POLL_ID") ?? "1";
    const optionsCount = Number(url.searchParams.get("optionsCount") ?? "2");
    if (!Number.isInteger(optionsCount) || optionsCount < 1 || optionsCount > 32) {
      res.status(400).json({ error: `Invalid optionsCount` });
      return;
    }

    const cacheKey = `${contractAddress}:${pollId}:${optionsCount}`;
    const now = Date.now();
    if (memoryCache && memoryCache.key === cacheKey && now - memoryCache.at < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
      res.setHeader("X-Cache", "HIT");
      res.status(200).json(memoryCache.data);
      return;
    }

    const nodeUrl = env("VITE_AZTEC_NODE_URL") || DEFAULT_NODE;
    const slots = await resolveSlots(pollId, optionsCount);
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
    const voteFrequency = (sealedFlags >> 1) & 1;
    const nowSec = Math.floor(Date.now() / 1000);
    const closed =
      voteEndedFlag || cancelled || (endsAt !== 0 && nowSec >= endsAt);
    const hideTallies = sealed && !closed;
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
    };

    memoryCache = { key: cacheKey, at: now, data };
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    res.setHeader("X-Cache", "MISS");
    res.status(200).json(data);
  } catch (error) {
    console.error("poll-state", error);
    res.status(502).json({ error: error?.message || String(error) });
  }
}
