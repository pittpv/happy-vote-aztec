/**
 * Lightweight public tallies API (no aztec.js runtime).
 * Uses raw JSON-RPC + known HappyVote map slots (Poseidon2 map derivation).
 */
const DEFAULT_NODE = "https://v5.testnet.rpc.aztec-labs.com";
const CACHE_TTL_MS = 15_000;
/** Contract-level `paused` PublicMutable (codegen slot 18), not a per-poll map. */
const PAUSED_SLOT = "0x12";

/**
 * Precomputed slots for known polls (deriveStorageSlotInMap Poseidon2).
 * Recompute via `node scripts/compute-slots.mjs <pollId> <optionsCount>`.
 * Do NOT lazy-import @aztec/* here — Vercel serverless lacks pino-pretty transport.
 */
const PRECOMPUTED = {
  "1": {
    tallies: [
      "0x06baebfd238caf7a5deca592831b242a70d94c07af56c14bf6a9b93188b3e6b4",
      "0x11d05c357dfaf79a90fab3ee30e9c6338e7b01270d97363a8475d53494f3adb3",
    ],
    total: "0x29dc8c7d0cd7c1466ed7fe05e006a2b50049d209be60512c9b2cb7af5a10a022",
    policy: "0x19d85eb93cdc773ceebf95f44d6135aceea42db777461ac3e29a1bb1249273d3",
    voteEnded: "0x0cf8ce2bc3b2b2ae03caaab0d8e620df5c780e2b09a43f0b9bd0458847308ca4",
    sealed: "0x1df69935b815bbd167efbd22f6f97d96f4a4be05c863c81c6d5359aa938024f5",
    startsAt: "0x25a286df9dac8b0b04d1f0f8dff42cbade7a7c35ccde7b254357cb1386731ea0",
    endsAt: "0x1a1b696e0bee39da8dac5f43ea0af379d9825d8131fcfe530f79cd29a795f5fd",
    cancelled: "0x0a8900c8076d089c1e0853189795b9215ac1bcba5317d598b944f65dac44b1a8",
  },
  "2": {
    tallies: [
      "0x1b945991781bd92ea6379d148d4d18a45b7b3d29c58bdaa041521e38086ac6a2",
      "0x26640bb4ebbb3cfedc3148757e165cd1a9423db65e7c7f526e74368a029f5343",
      "0x0886b6a9dd2f7c6e3984c926ad962d43d91cf9fb702abfab9d79e701018dabd2",
    ],
    total: "0x0814cfb0d92b7cc90d9903053c92106e17d39ed96908fde5b1f20ffa4ce574e2",
    policy: "0x1b2a5d455cab4740e443147754809bb1c9659b71a2e190ccd46a96b43d61224e",
    voteEnded: "0x02f2f2c711b07c5b3e451652f95e973cd3fddc316ad99df65e9872ea652c5050",
    sealed: "0x25ad04948afa1d452b6982c6176e938eafd9df78e83be35082c1d08d18b8aae5",
    startsAt: "0x2b5e79bc122b46322aa0aa5ebdf454610668fee02b8a96a897132982530a75a8",
    endsAt: "0x29dd978dc8a1beac3ed29e5bae264bf837aede75c1ca1357474aa92be818fa6c",
    cancelled: "0x23d7483264d96fcb229c072ecabef3faac70dfb6dbddcf490364ee5eb3c648e7",
  },
  "3": {
    tallies: [
      "0x03aa52cfb08ec2659803714a6cc5928c99bf03b2be0be2780d136e6fb67b5179",
      "0x246ccaf75686a18b2a387f2dbf5bd7c5ba2a5ad1b9a856df559d9250e4c8d589",
    ],
    total: "0x16ee43df76609024788af83ab7fecc63347ed8ab80d5f5338e250b51d5b8602c",
    policy: "0x1e0563e6101ac38fe9432cc18ef12325f5eed9c261a16afe76efebf100cd21da",
    voteEnded: "0x1ff113a83ed3e36ef00580b705cf6d26496d42ad7de586d222f15796dc43983c",
    sealed: "0x0a4695a7e02968b12a28fc63cf80bdb3f0a6fceea3006482e25209d1fc2cb4b6",
    startsAt: "0x1a596808e4e53a32f0d6197881c45ce6b873c6a291526ce92c07e4fc21ce56d1",
    endsAt: "0x2403a7add78c639009581e8a0774808a21e10394d1c23a13f69c8ed5a9d46344",
    cancelled: "0x25bf2d54475ffd45cb075e412b026bb8a2ce37e7d02f17f419457d1b9660f88f",
  },
};

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

async function rpcCall(nodeUrl, method, params) {
  const response = await fetch(nodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`RPC non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(json?.message || json?.error?.message || `HTTP ${response.status}`);
  }
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  return json.result;
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

function resolveSlots(pollId, optionsCount) {
  const entry = PRECOMPUTED[String(pollId)];
  if (!entry) {
    throw new Error(
      `No precomputed slots for pollId=${pollId}. Run: node scripts/compute-slots.mjs ${pollId} ${optionsCount}`,
    );
  }
  if (optionsCount > entry.tallies.length) {
    throw new Error(
      `optionsCount=${optionsCount} exceeds precomputed tallies (${entry.tallies.length}) for poll ${pollId}`,
    );
  }
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
    const slots = resolveSlots(pollId, optionsCount);
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
    const sealed = fieldToNumber(results[optionsCount + 3]) !== 0;
    const startsAt = fieldToNumber(results[optionsCount + 4]);
    const endsAt = fieldToNumber(results[optionsCount + 5]);
    const cancelled = fieldToNumber(results[optionsCount + 6]) !== 0;
    const paused = fieldToNumber(results[optionsCount + 7]) !== 0;
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
