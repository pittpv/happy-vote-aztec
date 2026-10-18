/**
 * Read-only tallies for HappyVote contracts on earlier Aztec networks.
 * The live site keeps voting on the current contract. This route never
 * falls back to zeros when a storage read fails.
 */
import manifest from "../data/earlier-networks.json" with { type: "json" };
import { fallbackSlots } from "./poll-slots.js";

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
    if (memoryCache && now - memoryCache.at < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
      res.setHeader("X-Cache", "HIT");
      res.status(200).json(memoryCache.data);
      return;
    }
    const data = await loadEarlierNetworks();
    memoryCache = { at: now, data };
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    res.setHeader("X-Cache", "MISS");
    res.status(200).json(data);
  } catch (error) {
    console.error("earlier-networks", error);
    res.status(502).json({ error: error?.message || String(error) });
  }
}
