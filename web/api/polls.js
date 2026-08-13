/**
 * Shared poll catalog (Phase 5.2).
 *
 * GET  /api/polls          → { polls: PollMeta[], source }
 * GET  /api/polls?id=3     → single poll
 * POST /api/polls          → upsert poll (Authorization: Bearer POLLS_PUBLISH_TOKEN)
 *
 * Persistence: embedded seed + optional Vercel Blob overlay (`BLOB_READ_WRITE_TOKEN`).
 */
import seedCatalog from "../data/polls-catalog.json" with { type: "json" };

const BLOB_PATHNAME = "happyvote/polls-catalog.json";

function loadSeed() {
  return seedCatalog || { version: 1, updatedAt: null, polls: {} };
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
}

function unauthorized(res) {
  return res.status(401).json({ ok: false, error: "Unauthorized" });
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
    zkRequirements: raw.zkRequirements ?? null,
    sealed: Boolean(raw.sealed),
    metadataHash: raw.metadataHash != null ? String(raw.metadataHash) : null,
    publishedAt: raw.publishedAt || new Date().toISOString(),
  };
}

async function readBlobCatalog() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const { list } = await import("@vercel/blob");
    const result = await list({ prefix: "happyvote/polls-catalog", token, limit: 10 });
    const match =
      result.blobs?.find((b) => b.pathname === BLOB_PATHNAME) || result.blobs?.[0];
    if (!match?.url) return null;
    const response = await fetch(match.url, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[polls] blob read failed", error);
    return null;
  }
}

async function writeBlobCatalog(catalog) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    const err = new Error("BLOB_READ_WRITE_TOKEN is not configured");
    err.code = "NO_BLOB";
    throw err;
  }
  const { put } = await import("@vercel/blob");
  const body = JSON.stringify(catalog, null, 2);
  const blob = await put(BLOB_PATHNAME, body, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
  return blob;
}

function mergeCatalogs(seed, overlay) {
  const polls = { ...(seed.polls || {}) };
  if (overlay?.polls && typeof overlay.polls === "object") {
    for (const [id, meta] of Object.entries(overlay.polls)) {
      polls[String(id)] = meta;
    }
  }
  return {
    version: Math.max(Number(seed.version || 1), Number(overlay?.version || 1)),
    updatedAt: overlay?.updatedAt || seed.updatedAt || null,
    polls,
    sources: {
      seed: true,
      blob: Boolean(overlay),
    },
  };
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
        return res.status(200).json({ ok: true, poll, sources: catalog.sources });
      }
      const polls = Object.values(catalog.polls).sort((a, b) => Number(a.id) - Number(b.id));
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
      const poll = normalizePoll(body.poll || body);

      const seed = loadSeed();
      const overlay = (await readBlobCatalog()) || { version: 1, polls: {} };
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
          poll,
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
            poll,
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
