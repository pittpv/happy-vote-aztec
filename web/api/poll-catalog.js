/**
 * Seed + optional Vercel Blob overlay for the shared poll catalog.
 */
import seedCatalog from "../data/polls-catalog.json" with { type: "json" };

export const BLOB_PATHNAME = "happyvote/polls-catalog.json";
const CATALOG_TTL_MS = 15_000;
const BLOB_READ_ATTEMPTS = 3;

/** @type {{ at: number, data: object } | null} */
let catalogCache = null;

export function loadSeed() {
  return seedCatalog || { version: 1, updatedAt: null, polls: {} };
}

export function invalidateCatalogCache() {
  catalogCache = null;
}

export function catalogCacheControl(catalog) {
  if (catalog?.sources?.blob) {
    return "public, s-maxage=30, stale-while-revalidate=120";
  }
  // Seed-only responses omit Blob polls (e.g. #5). Do not let the CDN keep that miss.
  return "public, max-age=0, s-maxage=5, must-revalidate";
}

async function readBlobCatalogOnce(token) {
  const { list } = await import("@vercel/blob");
  const result = await list({ prefix: "happyvote/polls-catalog", token, limit: 10 });
  const match =
    result.blobs?.find((b) => b.pathname === BLOB_PATHNAME) || result.blobs?.[0];
  if (!match?.url) return null;
  const response = await fetch(match.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`blob HTTP ${response.status}`);
  }
  return await response.json();
}

export async function readBlobCatalog() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  let lastError;
  for (let i = 0; i < BLOB_READ_ATTEMPTS; i++) {
    try {
      return await readBlobCatalogOnce(token);
    } catch (error) {
      lastError = error;
      if (i === BLOB_READ_ATTEMPTS - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** i));
    }
  }
  console.error("[polls] blob read failed", lastError);
  return null;
}

export async function writeBlobCatalog(catalog) {
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
  invalidateCatalogCache();
  return blob;
}

export function mergeCatalogs(seed, overlay) {
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

export async function loadMergedCatalog({ force = false } = {}) {
  const now = Date.now();
  if (!force && catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.data;
  }
  const seed = loadSeed();
  const overlay = await readBlobCatalog();
  const data = mergeCatalogs(seed, overlay);
  catalogCache = data.sources.blob ? { at: now, data } : null;
  return data;
}
