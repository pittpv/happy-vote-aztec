/**
 * Seed plus a host-file overlay for the shared poll catalog.
 * The overlay file is HAPPYVOTE_DATA_DIR/polls-catalog.json.
 */
import seedCatalog from "../data/polls-catalog.json" with { type: "json" };
import { readJson, writeJson } from "./local-store.js";

const OVERLAY_FILE = "polls-catalog.json";
const CATALOG_TTL_MS = 15_000;

/** @type {{ at: number, data: object } | null} */
let catalogCache = null;

export function loadSeed() {
  return seedCatalog || { version: 1, updatedAt: null, polls: {} };
}

export function invalidateCatalogCache() {
  catalogCache = null;
}

export function catalogCacheControl(catalog) {
  if (catalog?.sources?.overlay) {
    return "public, s-maxage=30, stale-while-revalidate=120";
  }
  // Seed-only responses omit overlay polls. Do not let a cache keep that miss.
  return "public, max-age=0, s-maxage=5, must-revalidate";
}

export async function readCatalogOverlay() {
  return readJson(OVERLAY_FILE);
}

export async function writeCatalogOverlay(catalog) {
  const saved = await writeJson(OVERLAY_FILE, catalog);
  invalidateCatalogCache();
  return saved;
}

export function mergeCatalogs(seed, overlay) {
  const polls = { ...(seed.polls || {}) };
  if (overlay?.polls && typeof overlay.polls === "object") {
    for (const [id, meta] of Object.entries(overlay.polls)) {
      polls[String(id)] = meta;
    }
  }
  const accounts = Array.isArray(overlay?.authoritativeAccounts)
    ? overlay.authoritativeAccounts.map((item) => String(item))
    : [];
  return {
    version: Math.max(Number(seed.version || 1), Number(overlay?.version || 1)),
    updatedAt: overlay?.updatedAt || seed.updatedAt || null,
    polls,
    authoritativeAccounts: accounts,
    sources: {
      seed: true,
      overlay: Boolean(overlay),
    },
  };
}

export async function loadMergedCatalog({ force = false } = {}) {
  const now = Date.now();
  if (!force && catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.data;
  }
  const seed = loadSeed();
  const overlay = await readCatalogOverlay();
  const data = mergeCatalogs(seed, overlay);
  catalogCache = data.sources.overlay ? { at: now, data } : null;
  return data;
}
