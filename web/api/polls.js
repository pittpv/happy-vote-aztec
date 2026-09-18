/**
 * Shared poll catalog (Phase 5.2).
 *
 * GET  /api/polls          → { polls: PollMeta[], source }
 * GET  /api/polls?id=3     → single poll
 * POST /api/polls          → upsert poll (Authorization: Bearer POLLS_PUBLISH_TOKEN)
 * POST /api/polls { homepage: [{ id, showOnHome, homeRank }] } → featured flags for `/`
 *
 * Persistence: embedded seed + optional Vercel Blob overlay (`BLOB_READ_WRITE_TOKEN`).
 */
import {
  loadSeed,
  mergeCatalogs,
  readBlobCatalog,
  writeBlobCatalog,
} from "./poll-catalog.js";
import { fallbackSlots, isUsableSlotEntry } from "./poll-slots.js";

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

function applyHomepage(mergedPolls, overlayPolls, entries) {
  const next = { ...overlayPolls };
  for (const entry of entries) {
    const existing = mergedPolls[entry.id] || next[entry.id];
    if (!existing) throw new Error(`Unknown poll ${entry.id}`);
    const optionCount = Array.isArray(existing.options) ? existing.options.length : 0;
    const storageSlots = isUsableSlotEntry(existing.storageSlots, optionCount)
      ? existing.storageSlots
      : fallbackSlots(entry.id, Math.max(optionCount, 2));
    next[entry.id] = {
      ...existing,
      showOnHome: entry.showOnHome,
      homeRank: entry.homeRank,
      ...(storageSlots ? { storageSlots } : {}),
    };
  }
  return next;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const seed = loadSeed();
      const overlay = await readBlobCatalog();
      const catalog = mergeCatalogs(seed, overlay);
      const url = new URL(req.url, "http://localhost");
      const id = url.searchParams.get("id");
      if (id) {
        const poll = catalog.polls[String(id)];
        if (!poll) return res.status(404).json({ ok: false, error: "Poll not found" });
        res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
        return res.status(200).json({ ok: true, poll: publicPoll(poll), sources: catalog.sources });
      }
      const polls = Object.values(catalog.polls)
        .map(publicPoll)
        .sort((a, b) => Number(a.id) - Number(b.id));
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
      return res.status(200).json({
        ok: true,
        updatedAt: catalog.updatedAt,
        polls,
        sources: catalog.sources,
      });
    }

    if (req.method === "POST") {
      if (!getPublishToken()) {
        return res.status(503).json({
          ok: false,
          error: "POLLS_PUBLISH_TOKEN is not configured on the server",
        });
      }
      if (!checkAuth(req)) return unauthorized(res);

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const seed = loadSeed();
      const overlay = (await readBlobCatalog()) || { version: 1, polls: {} };
      const merged = mergeCatalogs(seed, overlay);

      if (Array.isArray(body.homepage)) {
        const entries = normalizeHomepageEntries(body.homepage);
        const next = {
          version: Number(overlay.version || 1),
          updatedAt: new Date().toISOString(),
          polls: applyHomepage(merged.polls, overlay.polls || {}, entries),
        };
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

      const poll = normalizePoll(body.poll || body);
      const next = {
        version: Number(overlay.version || 1),
        updatedAt: new Date().toISOString(),
        polls: { ...(overlay.polls || {}), [poll.id]: poll },
      };
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
