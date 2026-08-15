/**
 * First-party cookieless visit aggregates.
 *
 * POST /api/site-stats  → ingest one pageview (no cookies, no IP stored)
 * GET  /api/site-stats  → operator-only daily aggregates
 *
 * Persistence: Vercel Blob overlay (`BLOB_READ_WRITE_TOKEN`), unguessable pathname.
 * Auth for GET: same bearer token as catalog publish.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function statsPathname() {
  const id = createHmac("sha256", hmacSecret())
    .update("site-stats-blob-name")
    .digest("hex")
    .slice(0, 32);
  return `happyvote/site-stats-${id}.json`;
}
const K_ANON = 3;
const MAX_UNIQUE_KEYS = 4000;
const KEEP_DAYS = 90;
const UNIQUE_KEY_TTL_DAYS = 2;
const MAX_RANGE_DAYS = 90;

function corsPost(res) {
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
}

function getPublishToken() {
  return process.env.POLLS_PUBLISH_TOKEN || process.env.VITE_POLLS_PUBLISH_TOKEN || "";
}

function hmacSecret() {
  return (
    process.env.SITE_STATS_SALT ||
    process.env.POLLS_PUBLISH_TOKEN ||
    process.env.BLOB_READ_WRITE_TOKEN ||
    "happyvote-stats-dev"
  );
}

function checkAuth(req) {
  const expected = getPublishToken();
  if (!expected) return false;
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const got = Buffer.from(String(match[1]));
  const want = Buffer.from(expected);
  if (got.length !== want.length) return false;
  try {
    return timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

function allowedIngestOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = new URL(String(origin)).hostname.toLowerCase();
    return (
      host === "aztec.happyvote.xyz" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app")
    );
  } catch {
    return false;
  }
}

function header(req, name) {
  const value = req.headers[name] || req.headers[name.toLowerCase()];
  return value == null ? "" : String(Array.isArray(value) ? value[0] : value);
}

function clientIp(req) {
  const forwarded = header(req, "x-forwarded-for") || header(req, "x-vercel-forwarded-for");
  const first = forwarded.split(",")[0].trim();
  return first || header(req, "x-real-ip").trim() || "";
}

function countryCode(req) {
  const raw = header(req, "x-vercel-ip-country").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(raw) && raw !== "XX") return raw;
  return "unknown";
}

function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseBody(req) {
  if (req.body == null || req.body === "") return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(String(req.body));
  } catch {
    return {};
  }
}

function bucketPath(rawPath) {
  const path = String(rawPath || "/").split("?")[0].split("#")[0];
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/admin" || clean.startsWith("/admin/")) return null;
  if (clean === "/") return "home";
  if (clean === "/polls") return "catalog";
  if (/^\/p\/\d+$/.test(clean)) return "polls";
  if (clean.startsWith("/legal/")) return "legal";
  return "other";
}

function isBot(ua) {
  return /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|redditbot|ahrefs|semrush|petalbot|bytespider|gptbot|claudebot|google-inspection|preview/i.test(
    ua,
  );
}

function deviceType(ua) {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobi|iphone|android.+mobile|opera mini|iemobile/i.test(ua)) return "mobile";
  if (!ua) return "other";
  return "desktop";
}

function browserFamily(ua) {
  if (/edg\//i.test(ua)) return "edge";
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/opr\/|opera/i.test(ua)) return "other";
  if (/chrome|crios/i.test(ua)) return "chrome";
  if (/safari/i.test(ua)) return "safari";
  return "other";
}

function referrerHost(req, bodyReferrer) {
  const raw = String(bodyReferrer || header(req, "referer") || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!host || host === "aztec.happyvote.xyz" || host === "localhost") return "";
    return host.slice(0, 80);
  } catch {
    return "";
  }
}

function uniqueKey({ ip, uaFamily, day }) {
  if (!ip) return "";
  return createHmac("sha256", hmacSecret())
    .update(`${day}|${ip}|${uaFamily}`)
    .digest("hex")
    .slice(0, 16);
}

function emptyDay() {
  return {
    pageviews: 0,
    uniques: 0,
    countries: {},
    sections: {},
    devices: {},
    browsers: {},
    referrers: {},
    uniqueKeys: [],
  };
}

function emptyStore() {
  return { version: 1, updatedAt: null, days: {} };
}

function bump(map, key, by = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + by;
}

function pruneStore(store, today) {
  const days = store.days || {};
  const keepFrom = shiftDay(today, -(KEEP_DAYS - 1));
  const uniqueKeepFrom = shiftDay(today, -(UNIQUE_KEY_TTL_DAYS - 1));
  for (const day of Object.keys(days)) {
    if (day < keepFrom) {
      delete days[day];
      continue;
    }
    const bucket = days[day];
    if (day < uniqueKeepFrom && Array.isArray(bucket.uniqueKeys)) {
      bucket.uniques = Math.max(Number(bucket.uniques) || 0, bucket.uniqueKeys.length);
      delete bucket.uniqueKeys;
    }
  }
  store.days = days;
  return store;
}

function shiftDay(day, delta) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function applyHit(store, hit) {
  const days = store.days || (store.days = {});
  const bucket = days[hit.day] || (days[hit.day] = emptyDay());
  bucket.pageviews += 1;
  bump(bucket.countries, hit.country);
  bump(bucket.sections, hit.section);
  bump(bucket.devices, hit.device);
  bump(bucket.browsers, hit.browser);
  bump(bucket.referrers, hit.referrer);
  if (hit.uniqueKey) {
    const keys = new Set(bucket.uniqueKeys || []);
    if (keys.has(hit.uniqueKey)) {
      bucket.uniques = keys.size;
    } else if (keys.size < MAX_UNIQUE_KEYS) {
      keys.add(hit.uniqueKey);
      bucket.uniqueKeys = [...keys];
      bucket.uniques = keys.size;
    }
  }
  store.updatedAt = new Date().toISOString();
}

async function readStore(token) {
  if (!token) return emptyStore();
  try {
    const { list } = await import("@vercel/blob");
    const pathname = statsPathname();
    const result = await list({ prefix: "happyvote/site-stats-", token, limit: 10 });
    const match = result.blobs?.find((b) => b.pathname === pathname);
    const url = match?.downloadUrl || match?.url;
    if (!url) return emptyStore();
    const bust = url.includes("?") ? `${url}&cb=${Date.now()}` : `${url}?cb=${Date.now()}`;
    const response = await fetch(bust, { cache: "no-store" });
    if (!response.ok) return emptyStore();
    const data = await response.json();
    if (!data || typeof data !== "object") return emptyStore();
    return {
      version: Number(data.version || 1),
      updatedAt: data.updatedAt || null,
      days: data.days && typeof data.days === "object" ? data.days : {},
    };
  } catch (error) {
    console.error("[site-stats] blob read failed", error);
    return emptyStore();
  }
}

async function writeStore(token, store) {
  if (!token) {
    const err = new Error("BLOB_READ_WRITE_TOKEN is not configured");
    err.code = "NO_BLOB";
    throw err;
  }
  const { put } = await import("@vercel/blob");
  await put(statsPathname(), JSON.stringify(store), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    token,
  });
}

function kAnonymize(map, k = K_ANON) {
  const out = {};
  let other = 0;
  for (const [key, count] of Object.entries(map || {})) {
    const n = Number(count) || 0;
    if (n < k) other += n;
    else out[key] = n;
  }
  if (other > 0) out.other = (out.other || 0) + other;
  return out;
}

function sumMaps(days, field) {
  const out = {};
  for (const bucket of days) {
    const map = bucket[field] || {};
    for (const [key, count] of Object.entries(map)) bump(out, key, Number(count) || 0);
  }
  return out;
}

function toRows(map) {
  return Object.entries(map)
    .map(([id, pageviews]) => ({ id, pageviews }))
    .sort((a, b) => b.pageviews - a.pageviews || a.id.localeCompare(b.id));
}

function summarize(store, rangeDays) {
  const today = utcDay();
  const from = shiftDay(today, -(rangeDays - 1));
  const series = [];
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const date = shiftDay(today, -i);
    const bucket = store.days?.[date] || emptyDay();
    series.push({
      date,
      pageviews: Number(bucket.pageviews) || 0,
      uniques: Number(bucket.uniques) || 0,
      countries: bucket.countries || {},
      sections: bucket.sections || {},
      devices: bucket.devices || {},
      browsers: bucket.browsers || {},
      referrers: bucket.referrers || {},
    });
  }
  const inRange = series.filter((d) => d.date >= from);
  const pageviews = inRange.reduce((sum, d) => sum + d.pageviews, 0);
  const uniques = inRange.reduce((sum, d) => sum + d.uniques, 0);
  return {
    generatedAt: new Date().toISOString(),
    rangeDays,
    updatedAt: store.updatedAt,
    totals: { pageviews, uniques },
    days: inRange.map(({ date, pageviews: views, uniques: uniq }) => ({
      date,
      pageviews: views,
      uniques: uniq,
    })),
    countries: toRows(kAnonymize(sumMaps(inRange, "countries"))),
    sections: toRows(sumMaps(inRange, "sections")),
    devices: toRows(sumMaps(inRange, "devices")),
    browsers: toRows(sumMaps(inRange, "browsers")),
    referrers: toRows(kAnonymize(sumMaps(inRange, "referrers"))),
    privacy: {
      cookies: false,
      storesIp: false,
      kAnonymity: K_ANON,
      uniqueWindow: "utc-calendar-day",
      pathDetail: "section-only",
    },
  };
}

export default async function handler(req, res) {
  corsPost(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "POST") {
      if (!allowedIngestOrigin(req)) return res.status(403).json({ ok: false });
      const ua = header(req, "user-agent");
      if (header(req, "dnt") === "1" || header(req, "sec-gpc") === "1" || isBot(ua)) {
        return res.status(204).end();
      }
      const body = parseBody(req);
      const section = bucketPath(body.path);
      if (!section) return res.status(204).end();

      const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
      if (!blobToken) return res.status(204).end();

      const day = utcDay();
      const uaFamily = browserFamily(ua);
      const hit = {
        day,
        country: countryCode(req),
        section,
        device: deviceType(ua),
        browser: uaFamily,
        referrer: referrerHost(req, body.referrer),
        uniqueKey: uniqueKey({ ip: clientIp(req), uaFamily, day }),
      };

      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const store = pruneStore(await readStore(blobToken), day);
          applyHit(store, hit);
          await writeStore(blobToken, store);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) console.error("[site-stats] ingest failed", lastError);
      return res.status(204).end();
    }

    if (req.method === "GET") {
      if (!getPublishToken()) {
        return res.status(503).json({ ok: false, error: "Stats read is not configured" });
      }
      if (!checkAuth(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });

      const url = new URL(req.url, "http://localhost");
      const rangeDays = Math.min(
        MAX_RANGE_DAYS,
        Math.max(1, Number(url.searchParams.get("days")) || 14),
      );
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
      if (!blobToken) {
        return res.status(200).json({
          ok: true,
          persisted: false,
          ...summarize(emptyStore(), rangeDays),
        });
      }
      const store = pruneStore(await readStore(blobToken), utcDay());
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({
        ok: true,
        persisted: true,
        ...summarize(store, rangeDays),
      });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error) {
    console.error("[site-stats]", error);
    if (req.method === "POST") return res.status(204).end();
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}
