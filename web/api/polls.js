/**
 * Shared poll catalog (Phase 5.2).
 *
 * GET  /api/polls          → { polls: PollMeta[], source }
 * GET  /api/polls?id=3     → single poll
 * POST /api/polls          → upsert poll (Authorization: Bearer POLLS_PUBLISH_TOKEN)
 * POST /api/polls { homepage: [{ id, showOnHome, homeRank }] } → featured flags for `/`
 * POST /api/polls { policy: { id, policyId } } → Dashboard PolicyID for an existing poll
 *
 * Persistence: embedded seed + optional Vercel Blob overlay (`BLOB_READ_WRITE_TOKEN`).
 */
import {
  catalogCacheControl,
  loadMergedCatalog,
  loadSeed,
  mergeCatalogs,
  readBlobCatalog,
  writeBlobCatalog,
} from "./poll-catalog.js";
import { fallbackSlots, isUsableSlotEntry } from "./poll-slots.js";
import { readAuthoritativeFlag, verifyAccountPoll } from "./verify-account-poll.js";
import { normalizeAddress } from "../src/lib/catalogMeta.js";
import {
  accountHomeFlag,
  isAuthoritativePoll,
  orderAuthoritative,
  partitionCatalogWindow,
  sortPolls,
} from "../src/lib/catalogSections.js";
import { pollCountryCodes } from "../src/lib/zkRequirements.js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
}

function unauthorized(res) {
  return res.status(401).json({ ok: false, error: "Unauthorized" });
}

function optionalIso(value) {
  if (value == null || String(value).trim() === "") return null;
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) {
    throw new Error("startsAt and endsAt must be ISO-8601 datetimes");
  }
  return new Date(ms).toISOString();
}

function getPublishToken() {
  return process.env.POLLS_PUBLISH_TOKEN || process.env.VITE_POLLS_PUBLISH_TOKEN || "";
}

const NEXT_POLL_ID_SLOT = "0x11";

function padHex32(hex) {
  const h = String(hex).replace(/^0x/i, "").toLowerCase();
  return `0x${h.padStart(64, "0")}`;
}

export async function readNextPollId() {
  const nodeUrl = process.env.VITE_AZTEC_NODE_URL;
  const contract = process.env.VITE_HAPPY_VOTE_CONTRACT_ADDRESS;
  if (!nodeUrl) throw new Error("VITE_AZTEC_NODE_URL is not configured");
  if (!contract) throw new Error("VITE_HAPPY_VOTE_CONTRACT_ADDRESS is not configured");
  const response = await fetch(nodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "node_getPublicStorageAt",
      params: ["latest", padHex32(contract), padHex32(NEXT_POLL_ID_SLOT)],
    }),
  });
  const json = await response.json();
  if (!response.ok || json.error) {
    throw new Error(json?.error?.message || `HTTP ${response.status}`);
  }
  const raw = json.result;
  const value = raw && typeof raw === "object" && "value" in raw ? raw.value : raw;
  if (value == null || value === "") throw new Error("next_poll_id storage is empty");
  // Bit 63 is the sponsored-fee flag on the Iteration 2 contract. Older
  // deployments leave it clear, so the counter is the same value.
  const counter = BigInt(value) & ((1n << 63n) - 1n);
  return Number(counter);
}

function onCurrentContract(poll, nextPollId) {
  return Number(poll.id) > 0 && Number(poll.id) < nextPollId;
}

function checkAuth(req) {
  const expected = getPublishToken();
  if (!expected) return false;
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return Boolean(match && match[1] === expected);
}

function normalizePoll(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Invalid poll body");
  const id = String(raw.id || "").trim();
  if (!/^\d+$/.test(id)) throw new Error("poll.id must be a positive integer string");
  const options = Array.isArray(raw.options)
    ? raw.options
        .map((o) => {
          if (typeof o === "string") {
            const label = o.trim();
            return label ? { label } : null;
          }
          if (o && typeof o === "object") {
            const label = String(o.label ?? o.title ?? "").trim();
            if (!label) return null;
            const description = String(o.description ?? "").trim();
            return description ? { label, description } : { label };
          }
          return null;
        })
        .filter(Boolean)
    : [];
  if (options.length < 2) throw new Error("Need at least 2 options");
  if (options.length > 32) throw new Error("At most 32 options");
  const title = String(raw.title || "").trim();
  if (!title) throw new Error("title is required");

  const eligibilityMode = Number(raw.eligibilityMode ?? 0);
  if (![0, 1, 2].includes(eligibilityMode)) {
    throw new Error("eligibilityMode must be 0, 1, or 2");
  }

  const startsAt = optionalIso(raw.startsAt);
  const endsAt = optionalIso(raw.endsAt);
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new Error("endsAt must be after startsAt");
  }

  const storageSlots = normalizeStorageSlots(raw.storageSlots, options.length);

  return {
    id,
    title,
    description: raw.description ? String(raw.description).trim() : undefined,
    topics: Array.isArray(raw.topics)
      ? raw.topics.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8)
      : [],
    countries: Array.isArray(raw.countries) ? raw.countries : [],
    options,
    template: options.length === 2 ? "binary" : String(raw.template || "single_choice"),
    requiresZkPassport: Boolean(raw.requiresZkPassport) || eligibilityMode > 0,
    eligibilityMode,
    privacyPolicy: [0, 1, 2].includes(Number(raw.privacyPolicy))
      ? Number(raw.privacyPolicy)
      : 2,
    voteFrequency: Number(raw.voteFrequency) === 1 ? 1 : 0,
    zkRequirements: raw.zkRequirements ?? null,
    sealed: Boolean(raw.sealed),
    startsAt,
    endsAt,
    showOnHome: raw.showOnHome == null ? true : Boolean(raw.showOnHome),
    homeRank: Number.isFinite(Number(raw.homeRank)) ? Number(raw.homeRank) : Number(id),
    metadataHash: raw.metadataHash != null ? String(raw.metadataHash) : null,
    publishedAt: raw.publishedAt || new Date().toISOString(),
    storageSlots,
  };
}

const SLOT_HEX = /^0x[0-9a-fA-F]{1,64}$/;
const SLOT_KEYS = ["total", "policy", "voteEnded", "sealed", "startsAt", "endsAt", "cancelled"];

function normalizeStorageSlots(raw, optionsCount) {
  if (raw == null) {
    throw new Error("storageSlots is required when publishing a poll");
  }
  if (typeof raw !== "object") throw new Error("storageSlots must be an object");
  if (!Array.isArray(raw.tallies) || raw.tallies.length < optionsCount) {
    throw new Error("storageSlots.tallies is incomplete");
  }
  const hex = (value, label) => {
    const text = String(value ?? "").trim();
    if (!SLOT_HEX.test(text)) throw new Error(`Invalid ${label} storage slot`);
    return text.toLowerCase();
  };
  return {
    tallies: raw.tallies.map((slot, i) => hex(slot, `tallies[${i}]`)),
    ...Object.fromEntries(SLOT_KEYS.map((key) => [key, hex(raw[key], key)])),
  };
}

function publicPoll(poll) {
  if (!poll || typeof poll !== "object") return poll;
  const { storageSlots, ...rest } = poll;
  return rest;
}

function accountSet(catalog) {
  return new Set((catalog.authoritativeAccounts || []).map((item) => String(item).toLowerCase()));
}

const ENDED_PAGE_MAX = 48;

function pageNumber(value, fallback, max, min = 0) {
  if (value == null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

function matchesCatalogQuery(poll, query) {
  const topic = query.get("topic") || "all";
  const country = query.get("country") || "all";
  const eligibility = query.get("eligibility") || "all";
  const q = String(query.get("q") || "").trim().toLowerCase();
  if (topic !== "all" && !(poll.topics || []).includes(topic)) return false;
  if (country !== "all" && !pollCountryCodes(poll).includes(country)) return false;
  if (eligibility === "open" && poll.requiresZkPassport) return false;
  if (eligibility === "zk" && !poll.requiresZkPassport) return false;
  if (q) {
    const hay = `${poll.title || ""} ${poll.description || ""} ${(poll.topics || []).join(" ")}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function listedPolls(catalog, nextPollId) {
  const accounts = accountSet(catalog);
  return Object.values(catalog.polls)
    .filter((poll) => onCurrentContract(poll, nextPollId))
    .filter((poll) => poll.hidden !== true)
    .map((poll) => annotatePoll(poll, accounts));
}

function annotatePoll(poll, accounts) {
  const pub = publicPoll(poll);
  const creator = String(pub.creator || "").toLowerCase();
  return {
    ...pub,
    creatorAuthoritative: pub.publisher === "account" && accounts.has(creator),
  };
}

function nextOverlay(overlay, polls, accounts) {
  return {
    version: Number(overlay.version || 1),
    updatedAt: new Date().toISOString(),
    polls,
    authoritativeAccounts: accounts ?? overlay.authoritativeAccounts ?? [],
  };
}

function normalizeHomepageEntries(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("homepage must be a non-empty array");
  }
  const seen = new Set();
  return raw.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid homepage entry");
    const id = String(item.id || "").trim();
    if (!/^\d+$/.test(id)) throw new Error("homepage entry id must be a positive integer string");
    if (seen.has(id)) throw new Error(`Duplicate homepage entry for poll ${id}`);
    seen.add(id);
    const rank = Number(item.homeRank);
    return {
      id,
      showOnHome: Boolean(item.showOnHome),
      homeRank: Number.isFinite(rank) ? rank : Number(id),
    };
  });
}

const POLICY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,120}$/;

function isZkPassportPoll(poll) {
  const mode = Number(poll?.eligibilityMode ?? 0);
  return mode > 0 || Boolean(poll?.requiresZkPassport) || Boolean(poll?.zkRequirements);
}

function overlayPollRecord(mergedPolls, overlayPolls, id) {
  const existing = mergedPolls[id] || overlayPolls[id];
  if (!existing) throw new Error(`Unknown poll ${id}`);
  const optionCount = Array.isArray(existing.options) ? existing.options.length : 0;
  const storageSlots = isUsableSlotEntry(existing.storageSlots, optionCount)
    ? existing.storageSlots
    : fallbackSlots(id, Math.max(optionCount, 2));
  return {
    existing,
    nextRecord: {
      ...existing,
      ...(storageSlots ? { storageSlots } : {}),
    },
  };
}

function normalizePolicyPatch(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Invalid policy patch");
  const id = String(raw.id || "").trim();
  if (!/^\d+$/.test(id)) throw new Error("policy poll id must be a positive integer string");
  const trimmed = raw.policyId == null ? "" : String(raw.policyId).trim();
  if (trimmed && !POLICY_ID_RE.test(trimmed)) {
    throw new Error(
      "Invalid policy id — use Dashboard id (pol_…) or slug (e.g. vote-identity-verification)",
    );
  }
  return { id, policyId: trimmed || null };
}

function applyPolicyId(mergedPolls, overlayPolls, patch) {
  const { existing, nextRecord } = overlayPollRecord(mergedPolls, overlayPolls, patch.id);
  if (!isZkPassportPoll(existing)) {
    throw new Error(`Poll ${patch.id} is open eligibility. PolicyID applies only to ZKPassport polls.`);
  }
  const prev =
    existing.zkRequirements && typeof existing.zkRequirements === "object"
      ? existing.zkRequirements
      : { personhood: true };
  return {
    ...overlayPolls,
    [patch.id]: {
      ...nextRecord,
      zkRequirements: {
        ...prev,
        policyId: patch.policyId,
      },
    },
  };
}

function applyHomepage(mergedPolls, overlayPolls, entries) {
  const next = { ...overlayPolls };
  for (const entry of entries) {
    const { nextRecord } = overlayPollRecord(mergedPolls, next, entry.id);
    next[entry.id] = {
      ...nextRecord,
      showOnHome: entry.showOnHome,
      homeRank: entry.homeRank,
    };
  }
  return next;
}

async function publishAccountPoll(res, body) {
  let poll;
  try {
    poll = await verifyAccountPoll(body);
  } catch (error) {
    const status = error?.code === "NO_AZTEC_LIBS" ? 503 : 400;
    return res.status(status).json({ ok: false, error: error?.message || String(error) });
  }
  const seed = loadSeed();
  const overlay = (await readBlobCatalog()) || { version: 1, polls: {} };
  poll.showOnHome = accountHomeFlag((overlay.polls || {})[poll.id]);
  const next = nextOverlay(overlay, { ...(overlay.polls || {}), [poll.id]: poll });
  const mergedForClients = mergeCatalogs(seed, next);
  try {
    const blob = await writeBlobCatalog(next);
    return res.status(200).json({
      ok: true,
      poll: annotatePoll(poll, accountSet(mergedForClients)),
      persisted: true,
      blobUrl: blob.url,
    });
  } catch (error) {
    if (error?.code === "NO_BLOB") {
      return res.status(503).json({
        ok: false,
        error: "BLOB_READ_WRITE_TOKEN is not configured — the poll was not listed.",
        persisted: false,
      });
    }
    throw error;
  }
}

async function publishAuthoritative(res, seed, overlay, raw) {
  let address;
  try {
    address = normalizeAddress(raw.address);
  } catch (error) {
    return res.status(400).json({ ok: false, error: error?.message || String(error) });
  }
  const enabled = Boolean(raw.enabled);
  let onChain = false;
  try {
    onChain = await readAuthoritativeFlag(address);
  } catch (error) {
    if (error?.code === "NO_AZTEC_LIBS") {
      return res.status(503).json({ ok: false, error: error.message });
    }
    return res.status(400).json({
      ok: false,
      error: error?.message || "Could not read the authoritative flag on the contract",
    });
  }
  if (enabled !== onChain) {
    return res.status(409).json({
      ok: false,
      error: "The contract flag does not match this change. Send set_authoritative first.",
    });
  }
  const current = new Set((overlay.authoritativeAccounts || []).map((item) => String(item).toLowerCase()));
  if (enabled) current.add(address);
  else current.delete(address.toLowerCase());
  const authoritativeAccounts = [...current];
  const next = nextOverlay(overlay, overlay.polls || {}, authoritativeAccounts);
  const mergedForClients = mergeCatalogs(seed, next);
  try {
    const blob = await writeBlobCatalog(next);
    return res.status(200).json({
      ok: true,
      persisted: true,
      blobUrl: blob.url,
      authoritativeAccounts: mergedForClients.authoritativeAccounts,
    });
  } catch (error) {
    if (error?.code === "NO_BLOB") {
      return res.status(503).json({
        ok: false,
        error: "BLOB_READ_WRITE_TOKEN is not configured — the mark was not saved.",
        persisted: false,
      });
    }
    throw error;
  }
}

async function publishHide(res, seed, overlay, merged, raw) {
  const id = String(raw.id || "").trim();
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ ok: false, error: "hide.id must be a poll id" });
  }
  if (!merged.polls[id]) {
    return res.status(404).json({ ok: false, error: `Unknown poll ${id}` });
  }
  const { nextRecord } = overlayPollRecord(merged.polls, overlay.polls || {}, id);
  const polls = {
    ...(overlay.polls || {}),
    [id]: { ...nextRecord, hidden: Boolean(raw.hidden) },
  };
  const next = nextOverlay(overlay, polls);
  const mergedForClients = mergeCatalogs(seed, next);
  try {
    const blob = await writeBlobCatalog(next);
    return res.status(200).json({
      ok: true,
      persisted: true,
      blobUrl: blob.url,
      poll: annotatePoll(mergedForClients.polls[id], accountSet(mergedForClients)),
    });
  } catch (error) {
    if (error?.code === "NO_BLOB") {
      return res.status(503).json({
        ok: false,
        error: "BLOB_READ_WRITE_TOKEN is not configured — the listing was not updated.",
        persisted: false,
      });
    }
    throw error;
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const catalog = await loadMergedCatalog();
      const url = new URL(req.url, "http://localhost");
      if (url.searchParams.get("manage") === "1") {
        if (!checkAuth(req)) return unauthorized(res);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json({
          ok: true,
          authoritativeAccounts: catalog.authoritativeAccounts || [],
        });
      }
      const nextPollId = await readNextPollId();
      const id = url.searchParams.get("id");
      if (id) {
        const poll = catalog.polls[String(id)];
        if (!poll || !onCurrentContract(poll, nextPollId)) {
          res.setHeader("Cache-Control", "private, no-store");
          return res.status(404).json({ ok: false, error: "Poll not found" });
        }
        res.setHeader("Cache-Control", catalogCacheControl(catalog));
        return res.status(200).json({
          ok: true,
          poll: annotatePoll(poll, accountSet(catalog)),
          sources: catalog.sources,
        });
      }
      const listed = listedPolls(catalog, nextPollId);
      const windowed = partitionCatalogWindow(listed);
      if (url.searchParams.get("ended") === "1") {
        const lane = url.searchParams.get("lane");
        if (lane !== "authoritative" && lane !== "users") {
          return res.status(400).json({ ok: false, error: "ended list requires lane" });
        }
        const sort = url.searchParams.get("sort") || "id";
        const sortMode = sort === "newest" || sort === "ending" ? sort : "id";
        const offset = pageNumber(url.searchParams.get("offset"), 0, 100_000);
        const limit = pageNumber(url.searchParams.get("limit"), 24, ENDED_PAGE_MAX, 1);
        const matched = windowed.ended.filter(
          (poll) =>
            (lane === "authoritative" ? isAuthoritativePoll(poll) : !isAuthoritativePoll(poll)) &&
            matchesCatalogQuery(poll, url.searchParams),
        );
        const ordered =
          lane === "authoritative" ? orderAuthoritative(matched, sortMode) : sortPolls(matched, sortMode);
        res.setHeader("Cache-Control", catalogCacheControl(catalog));
        return res.status(200).json({
          ok: true,
          updatedAt: catalog.updatedAt,
          polls: ordered.slice(offset, offset + limit),
          ended: { lane, offset, limit, total: ordered.length },
          sources: catalog.sources,
        });
      }
      const polls = sortPolls(windowed.live, "id");
      res.setHeader("Cache-Control", catalogCacheControl(catalog));
      return res.status(200).json({
        ok: true,
        updatedAt: catalog.updatedAt,
        polls,
        endedCount: windowed.ended.length,
        sources: catalog.sources,
      });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      if (body.accountPoll) {
        if (body.homepage || body.policy || body.hide || body.authoritative) {
          return res.status(400).json({
            ok: false,
            error: "Account publish cannot change operator fields",
          });
        }
        return publishAccountPoll(res, body.accountPoll);
      }

      if (!getPublishToken()) {
        return res.status(503).json({
          ok: false,
          error: "POLLS_PUBLISH_TOKEN is not configured on the server",
        });
      }
      if (!checkAuth(req)) return unauthorized(res);
      const seed = loadSeed();
      const overlay = (await readBlobCatalog()) || { version: 1, polls: {} };
      const merged = mergeCatalogs(seed, overlay);

      if (body.authoritative && typeof body.authoritative === "object") {
        return publishAuthoritative(res, seed, overlay, body.authoritative);
      }

      if (body.hide && typeof body.hide === "object") {
        return publishHide(res, seed, overlay, merged, body.hide);
      }

      if (Array.isArray(body.homepage)) {
        const entries = normalizeHomepageEntries(body.homepage);
        const next = nextOverlay(
          overlay,
          applyHomepage(merged.polls, overlay.polls || {}, entries),
        );
        const mergedForClients = mergeCatalogs(seed, next);
        try {
          const blob = await writeBlobCatalog(next);
          return res.status(200).json({
            ok: true,
            persisted: true,
            blobUrl: blob.url,
            totalPolls: Object.keys(mergedForClients.polls).length,
            homepage: Object.values(mergedForClients.polls)
              .filter((p) => p.showOnHome !== false)
              .map((p) => p.id),
          });
        } catch (error) {
          if (error?.code === "NO_BLOB") {
            return res.status(503).json({
              ok: false,
              error:
                "BLOB_READ_WRITE_TOKEN is not configured — homepage selection saved only in this browser until Blob is configured.",
              persisted: false,
            });
          }
          throw error;
        }
      }

      if (body.policy && typeof body.policy === "object") {
        let patch;
        let patchedPolls;
        try {
          patch = normalizePolicyPatch(body.policy);
          patchedPolls = applyPolicyId(merged.polls, overlay.polls || {}, patch);
        } catch (error) {
          return res.status(400).json({ ok: false, error: error?.message || String(error) });
        }
        const next = nextOverlay(overlay, patchedPolls);
        const mergedForClients = mergeCatalogs(seed, next);
        const poll = publicPoll(mergedForClients.polls[patch.id]);
        try {
          const blob = await writeBlobCatalog(next);
          return res.status(200).json({
            ok: true,
            persisted: true,
            blobUrl: blob.url,
            poll,
            policyId: poll?.zkRequirements?.policyId ?? null,
          });
        } catch (error) {
          if (error?.code === "NO_BLOB") {
            return res.status(503).json({
              ok: false,
              error:
                "BLOB_READ_WRITE_TOKEN is not configured — PolicyID saved only in this browser until Blob is configured.",
              persisted: false,
              poll,
              policyId: poll?.zkRequirements?.policyId ?? null,
            });
          }
          throw error;
        }
      }

      const incoming = body.poll || body;
      const poll = normalizePoll(incoming);
      const prior = merged.polls[poll.id];
      if (prior?.publisher) poll.publisher = prior.publisher;
      if (prior?.creator) poll.creator = prior.creator;
      if (prior?.feeMode) poll.feeMode = prior.feeMode;
      if (prior?.feeFallback) poll.feeFallback = prior.feeFallback;
      if (!Object.prototype.hasOwnProperty.call(incoming, "hidden")) {
        poll.hidden = Boolean(prior?.hidden);
      } else {
        poll.hidden = Boolean(incoming.hidden);
      }
      if (poll.publisher === "account") poll.showOnHome = accountHomeFlag(prior);
      const next = nextOverlay(overlay, { ...(overlay.polls || {}), [poll.id]: poll });
      // Keep seed polls visible even if blob only has overlays
      const mergedForClients = mergeCatalogs(seed, next);

      try {
        const blob = await writeBlobCatalog(next);
        return res.status(200).json({
          ok: true,
          poll: publicPoll(poll),
          persisted: true,
          blobUrl: blob.url,
          totalPolls: Object.keys(mergedForClients.polls).length,
        });
      } catch (error) {
        if (error?.code === "NO_BLOB") {
          return res.status(503).json({
            ok: false,
            error:
              "BLOB_READ_WRITE_TOKEN is not configured — poll saved only in the admin browser. Add Vercel Blob to publish globally.",
            poll: publicPoll(poll),
            persisted: false,
          });
        }
        throw error;
      }
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error) {
    console.error("[polls]", error);
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}
