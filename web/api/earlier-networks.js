/**
 * Read-only tallies for HappyVote contracts on earlier Aztec networks.
 * The live site keeps voting on the current contract. This route never
 * falls back to zeros when a storage read fails.
 */
import manifest from "../data/earlier-networks.json" with { type: "json" };
import snapshotFile from "../data/earlier-networks-snapshot.json" with { type: "json" };
import { fallbackSlots } from "./poll-slots.js";

const SNAPSHOT_BLOB = "happyvote/earlier-networks-snapshot.json";
const LIVE_FETCH_MS = 3000;

const CACHE_TTL_MS = 15_000;

/** @type {{ at: number, data: object } | null} */
let memoryCache = null;

function padHex32(hex) {
  const h = String(hex).replace(/^0x/i, "").toLowerCase();
  return `0x${h.padStart(64, "0")}`;
}

function fieldToNumber(value) {
  if (value == null) {
    throw new Error("Missing storage value");
  }
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    if (value === "0x" || value === "") return 0;
    return Number(BigInt(value));
  }
  if (typeof value === "object" && (typeof value.value === "string" || typeof value.value === "number")) {
    return fieldToNumber(value.value);
  }
  throw new Error(`Unexpected storage value: ${JSON.stringify(value)}`);
}

async function rpcBatch(nodeUrl, calls) {
  const out = [];
  for (let offset = 0; offset < calls.length; offset += 10) {
    const part = await rpcBatchOnce(nodeUrl, calls.slice(offset, offset + 10));
    out.push(...part);
  }
  return out;
}

async function rpcBatchOnce(nodeUrl, calls) {
  const body = calls.map((call, index) => ({
    jsonrpc: "2.0",
    id: index + 1,
    method: call.method,
    params: call.params,
  }));
  const response = await fetch(nodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LIVE_FETCH_MS),
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
      if (item.error) throw new Error(item.error.message || JSON.stringify(item.error));
      return item.result;
    });
}

function readPlan(network) {
  const contract = padHex32(network.contractAddress);
  const plans = [];
  for (const poll of network.polls) {
    const options = poll.options;
    if (!Array.isArray(options) || options.length < 1) {
      throw new Error(`Archive poll ${poll.id} has no options`);
    }
    const slots = fallbackSlots(poll.id, options.length);
    if (!slots) {
      throw new Error(`Archive poll ${poll.id} has no storage slots`);
    }
    const fields = [
      ...slots.tallies.map((slot) => ({ kind: "tally", slot })),
      { kind: "total", slot: slots.total },
      { kind: "sealed", slot: slots.sealed },
      { kind: "ended", slot: slots.voteEnded },
      { kind: "ends", slot: slots.endsAt },
      { kind: "cancelled", slot: slots.cancelled },
    ];
    plans.push({ poll, fields, contract });
  }
  return plans;
}

export async function loadEarlierNetworks() {
  const networks = manifest.networks;
  if (!Array.isArray(networks) || networks.length === 0) {
    throw new Error("No earlier networks are configured");
  }

  const loaded = [];
  for (const network of networks) {
    if (!network.rpcUrl || !network.contractAddress || !network.name) {
      throw new Error(`Earlier network ${network.id || "?"} is incomplete`);
    }
    const plans = readPlan(network);
    const calls = [];
    for (const plan of plans) {
      for (const field of plan.fields) {
        calls.push({
          method: "node_getPublicStorageAt",
          params: ["latest", plan.contract, padHex32(field.slot)],
        });
      }
    }
    const values = await rpcBatch(network.rpcUrl, calls);
    let cursor = 0;
    const polls = plans.map((plan) => {
      const slice = values.slice(cursor, cursor + plan.fields.length);
      cursor += plan.fields.length;
      if (slice.length !== plan.fields.length) {
        throw new Error(`Short storage read for poll ${plan.poll.id}`);
      }
      const numbers = slice.map(fieldToNumber);
      const optionCount = plan.poll.options.length;
      const tallies = numbers.slice(0, optionCount);
      const total = numbers[optionCount];
      const sealedFlags = numbers[optionCount + 1];
      const voteEnded = numbers[optionCount + 2] !== 0;
      const endsAt = numbers[optionCount + 3];
      const cancelled = numbers[optionCount + 4] !== 0;
      const sealed = (sealedFlags & 1) !== 0;
      const nowSec = Math.floor(Date.now() / 1000);
      const closed = voteEnded || cancelled || (endsAt !== 0 && nowSec >= endsAt);
      const resultsHidden = sealed && !closed;
      const poll = {
        id: String(plan.poll.id),
        title: plan.poll.title,
        total: resultsHidden ? null : total,
        resultsHidden,
        options: plan.poll.options.map((label, index) => {
          const option = { label };
          if (!resultsHidden) option.votes = tallies[index];
          return option;
        }),
      };
      if (!resultsHidden) {
        const sum = tallies.reduce((acc, count) => acc + count, 0);
        if (sum !== total) {
          throw new Error(`Poll ${plan.poll.id} tally sum ${sum} does not match total ${total}`);
        }
      }
      return poll;
    });
    loaded.push({
      id: network.id,
      name: network.name,
      contractAddress: network.contractAddress,
      polls,
    });
  }
  return { networks: loaded };
}

function usableSnapshot(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.networks) || raw.networks.length === 0) {
    return null;
  }
  for (const network of raw.networks) {
    if (!network?.id || !network.name || !network.contractAddress || !Array.isArray(network.polls)) {
      return null;
    }
    if (network.polls.length === 0) return null;
    for (const poll of network.polls) {
      if (!poll?.title || !Array.isArray(poll.options) || poll.options.length === 0) return null;
    }
  }
  return {
    capturedAt: typeof raw.capturedAt === "string" ? raw.capturedAt : null,
    networks: raw.networks,
  };
}

async function readBlobSnapshot() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const { list } = await import("@vercel/blob");
  const result = await list({ prefix: "happyvote/earlier-networks-snapshot", token, limit: 10 });
  const match = result.blobs?.find((blob) => blob.pathname === SNAPSHOT_BLOB) || result.blobs?.[0];
  if (!match?.url) return null;
  const response = await fetch(match.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`snapshot blob HTTP ${response.status}`);
  return usableSnapshot(await response.json());
}

export async function readEarlierSnapshot() {
  try {
    const fromBlob = await readBlobSnapshot();
    if (fromBlob) return fromBlob;
  } catch (error) {
    console.error("earlier-networks snapshot read failed", error);
  }
  return usableSnapshot(snapshotFile);
}

async function writeEarlierSnapshot(snapshot) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("earlier-networks snapshot skipped: blob token is not configured");
    return;
  }
  const { put } = await import("@vercel/blob");
  await put(SNAPSHOT_BLOB, JSON.stringify(snapshot), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
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
    const now = Date.now();
    if (memoryCache && now - memoryCache.at < memoryCache.ttl) {
      res.setHeader("Cache-Control", memoryCache.cacheControl);
      res.setHeader("X-Cache", "HIT");
      res.status(200).json(memoryCache.data);
      return;
    }

    try {
      const live = await loadEarlierNetworks();
      const capturedAt = new Date().toISOString();
      const data = { source: "live", capturedAt, networks: live.networks };
      try {
        await writeEarlierSnapshot({ capturedAt, networks: live.networks });
      } catch (error) {
        console.error("earlier-networks snapshot write failed", error);
      }
      const cacheControl = "public, s-maxage=60, stale-while-revalidate=300";
      memoryCache = { at: now, ttl: CACHE_TTL_MS, cacheControl, data };
      res.setHeader("Cache-Control", cacheControl);
      res.setHeader("X-Cache", "MISS");
      res.status(200).json(data);
      return;
    } catch (error) {
      console.error("earlier-networks", error);
      const snapshot = await readEarlierSnapshot();
      if (snapshot) {
        const data = {
          source: "snapshot",
          capturedAt: snapshot.capturedAt,
          networks: snapshot.networks,
        };
        const cacheControl = "public, s-maxage=86400, stale-while-revalidate=604800";
        memoryCache = { at: now, ttl: 60 * 60 * 1000, cacheControl, data };
        res.setHeader("Cache-Control", cacheControl);
        res.setHeader("X-Cache", "SNAPSHOT");
        res.status(200).json(data);
        return;
      }
      const data = { source: "none", capturedAt: null, networks: [] };
      const cacheControl = "public, s-maxage=21600, stale-while-revalidate=86400";
      memoryCache = { at: now, ttl: 60 * 60 * 1000, cacheControl, data };
      res.setHeader("Cache-Control", cacheControl);
      res.setHeader("X-Cache", "NONE");
      res.status(200).json(data);
    }
  } catch (error) {
    console.error("earlier-networks", error);
    res.status(500).json({ error: error?.message || String(error) });
  }
}
