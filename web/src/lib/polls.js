/**
 * Off-chain poll metadata (on-chain stores options_count + privacy + eligibility + sealed).
 * Shared catalog: GET /api/polls (seed + optional Vercel Blob).
 * Local cache: localStorage for admin drafts / offline merge.
 */
import {
  ELIGIBILITY_MODE,
  countriesFromRequirements,
  defaultZkRequirements,
  normalizeZkRequirements,
} from "./zkRequirements.js";
import { pollPath as routePollPath } from "./routing.js";

export const EXPLORER_TX_BASE = "https://testnet.aztecscan.xyz/txns";
export const EXPLORER_ADDR_BASE = "https://testnet.aztecscan.xyz/address";

const STORAGE_KEY = "happyvote.aztec.polls.v1";
const VOTED_KEY = "happyvote.aztec.voted.v1";

/** @type {Record<string, object>} */
let sharedCatalog = {};

/**
 * Normalize option list: string | { label, description? } → { label, description? }[]
 * @param {unknown} raw
 * @returns {{ label: string, description?: string }[]}
 */
export function normalizePollOptions(raw) {
  if (!Array.isArray(raw)) {
    return [
      { label: "Option A" },
      { label: "Option B" },
    ];
  }
  return raw
    .map((item, index) => {
      if (typeof item === "string") {
        const label = item.trim();
        return label ? { label } : null;
      }
      if (item && typeof item === "object") {
        const label = String(item.label ?? item.title ?? "").trim();
        if (!label) return null;
        const description = String(item.description ?? "").trim();
        return description ? { label, description } : { label };
      }
      return { label: `Option ${index + 1}` };
    })
    .filter(Boolean);
}

/** @param {unknown} raw @returns {string[]} */
export function pollOptionLabels(raw) {
  return normalizePollOptions(raw).map((o) => o.label);
}

/** Static seed (also mirrored in data/polls-catalog.json for the API). */
export const POLLS = {
  1: {
    id: "1",
    title: "How are you feeling?",
    description: "Binary Happy/Sad poll on Aztec Testnet — open eligibility.",
    topics: ["demo", "mood"],
    countries: [],
    options: [
      { label: "Happy", description: "Feeling good today." },
      { label: "Sad", description: "Could be better." },
    ],
    template: "binary",
    requiresZkPassport: false,
    eligibilityMode: ELIGIBILITY_MODE.OPEN,
    zkRequirements: null,
    sealed: false,
  },
  2: {
    id: "2",
    title: "Which demo feature should we ship next?",
    description: "Single-choice roadmap poll for the Aztec HappyVote demo.",
    topics: ["demo", "product"],
    countries: [],
    options: [
      {
        label: "Sealed tallies",
        description: "Hide live results until the poll ends.",
      },
      {
        label: "Share embeds",
        description: "Embeddable poll cards for other sites.",
      },
      {
        label: "ZKPassport gates",
        description: "Personhood / age / nationality eligibility.",
      },
    ],
    template: "single_choice",
    requiresZkPassport: false,
    eligibilityMode: ELIGIBILITY_MODE.OPEN,
    zkRequirements: null,
    sealed: false,
  },
};

function readStoredPolls() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function savePollMeta(meta) {
  if (!meta?.id) throw new Error("poll meta.id is required");
  if (typeof localStorage === "undefined") {
    throw new Error("localStorage unavailable — cannot persist poll metadata");
  }
  const all = readStoredPolls();
  all[String(meta.id)] = meta;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return meta;
}

function mergedMap() {
  return { ...POLLS, ...sharedCatalog, ...readStoredPolls() };
}

export function listPolls() {
  return Object.values(mergedMap()).sort((a, b) => Number(a.id) - Number(b.id));
}

export function hasKnownPollMeta(pollId) {
  const key = String(pollId);
  const map = mergedMap();
  return Boolean(map[key] || map[Number(key)]);
}

export function getPollMeta(pollId) {
  const key = String(pollId);
  const meta = mergedMap()[key] || mergedMap()[Number(key)];
  if (meta) {
    return hydrateMeta(meta);
  }
  return hydrateMeta({
    id: key,
    title: `Poll #${key}`,
    description: "Custom poll — metadata not in shared catalog yet.",
    options: [{ label: "Option A" }, { label: "Option B" }],
    template: "single_choice",
    requiresZkPassport: import.meta.env.VITE_REQUIRE_ZKPASSPORT === "true",
    eligibilityMode: ELIGIBILITY_MODE.OPEN,
    zkRequirements: null,
    sealed: false,
  });
}

/**
 * Fetch shared catalog from /api/polls and cache in memory.
 * @returns {Promise<object[]>}
 */
export async function refreshSharedCatalog() {
  try {
    const response = await fetch("/api/polls", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
    const data = await response.json();
    const next = {};
    for (const poll of data.polls || []) {
      if (poll?.id != null) next[String(poll.id)] = poll;
    }
    sharedCatalog = next;
    return listPolls();
  } catch (error) {
    console.warn("[polls] shared catalog fetch failed", error);
    return listPolls();
  }
}

/**
 * Publish poll metadata for all users (requires POLLS_PUBLISH_TOKEN on server + Blob).
 */
export async function publishPollMeta(meta, publishToken) {
  const token =
    publishToken ||
    import.meta.env.VITE_POLLS_PUBLISH_TOKEN ||
    (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("happyvote.publishToken") : null);
  if (!token) {
    return {
      ok: false,
      persisted: false,
      error: "Missing publish token (set VITE_POLLS_PUBLISH_TOKEN or paste token in Admin).",
    };
  }
  const response = await fetch("/api/polls", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ poll: meta }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.ok && data.ok && data.persisted) {
    sharedCatalog = { ...sharedCatalog, [String(meta.id)]: meta };
  }
  return {
    ok: Boolean(data.ok),
    persisted: Boolean(data.persisted),
    error: data.error || (!response.ok ? `HTTP ${response.status}` : null),
    blobUrl: data.blobUrl || null,
  };
}

export function markVoted(pollId) {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(VOTED_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[String(pollId)] = { at: new Date().toISOString() };
    localStorage.setItem(VOTED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function hasVotedReceipt(pollId) {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(VOTED_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw);
    return Boolean(map[String(pollId)]);
  } catch {
    return false;
  }
}

function hydrateMeta(meta) {
  const requiresZk =
    Boolean(meta.requiresZkPassport) ||
    meta.eligibilityMode === ELIGIBILITY_MODE.PERSONHOOD ||
    meta.eligibilityMode === ELIGIBILITY_MODE.GATED ||
    Boolean(meta.zkRequirements);

  let zkRequirements = meta.zkRequirements ?? null;
  if (requiresZk && !zkRequirements) {
    zkRequirements = defaultZkRequirements();
  }
  if (zkRequirements) {
    try {
      zkRequirements = normalizeZkRequirements(zkRequirements);
    } catch {
      zkRequirements = defaultZkRequirements();
    }
  }

  const topics = Array.isArray(meta.topics)
    ? meta.topics.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : [];
  const countries = Array.isArray(meta.countries)
    ? meta.countries
    : countriesFromRequirements(zkRequirements);

  const options = normalizePollOptions(meta.options);

  return {
    ...meta,
    id: String(meta.id),
    topics,
    countries,
    options,
    requiresZkPassport: requiresZk,
    eligibilityMode:
      meta.eligibilityMode ??
      (requiresZk ? ELIGIBILITY_MODE.PERSONHOOD : ELIGIBILITY_MODE.OPEN),
    zkRequirements,
    sealed: Boolean(meta.sealed),
  };
}

/** Parse `/p/:id` from the path; null when not on a poll page. */
export function parsePollIdFromPath(pathname = window.location.pathname) {
  const match = String(pathname).match(/^\/p\/(\d+)\/?$/);
  return match ? match[1] : null;
}

export function pollPath(pollId) {
  return routePollPath(pollId);
}

export function explorerTxUrl(txHash) {
  if (!txHash) throw new Error("Missing tx hash for explorer link");
  const hash = String(txHash).replace(/^0x/i, "");
  return `${EXPLORER_TX_BASE}/0x${hash}`;
}

export function explorerAddressUrl(address) {
  if (!address) throw new Error("Missing address for explorer link");
  return `${EXPLORER_ADDR_BASE}/${address}`;
}

export async function reportClientError(payload) {
  try {
    await fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        href: typeof location !== "undefined" ? location.href : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
