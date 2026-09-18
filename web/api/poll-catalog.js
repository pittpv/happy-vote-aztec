/**
 * Seed + optional Vercel Blob overlay for the shared poll catalog.
 */
import seedCatalog from "../data/polls-catalog.json" with { type: "json" };

export const BLOB_PATHNAME = "happyvote/polls-catalog.json";

export function loadSeed() {
  return seedCatalog || { version: 1, updatedAt: null, polls: {} };
}

export async function readBlobCatalog() {
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

export async function loadMergedCatalog() {
  const seed = loadSeed();
  const overlay = await readBlobCatalog();
  return mergeCatalogs(seed, overlay);
}
