/**
 * Per-page share image. The URL is unique for each poll, FAQ, and other public route.
 */
import { loadMergedCatalog } from "./poll-catalog.js";
import { resolvePageSeo } from "../src/lib/resolvePageSeo.js";
import { SITE_NAME } from "../src/lib/site.js";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapLines(text, maxChars) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function kickerFor(path) {
  if (path.startsWith("/p/")) return "Poll";
  if (path === "/polls") return "All polls";
  if (path === "/faq") return "FAQ";
  if (path.startsWith("/legal/")) return "Legal";
  return SITE_NAME;
}

export function renderOgSvg({ title, kicker }) {
  const lines = wrapLines(title, 26);
  const tspans = lines
    .map((line, index) => `<tspan x="80" dy="${index === 0 ? 0 : 78}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(title)}">
  <rect width="1200" height="630" fill="#0b1c1a"/>
  <rect width="14" height="630" fill="#e3a23a"/>
  <text x="80" y="150" fill="#e3a23a" font-size="32" font-family="Georgia, 'Times New Roman', serif">${escapeXml(kicker)}</text>
  <text x="80" y="250" fill="#e8f3ef" font-size="64" font-family="Georgia, 'Times New Roman', serif">${tspans}</text>
  <text x="80" y="560" fill="#9bb0aa" font-size="28" font-family="Georgia, 'Times New Roman', serif">aztec.happyvote.xyz</text>
</svg>`;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.searchParams.get("path") || "/";
    if (!path.startsWith("/") || path.includes("..")) {
      throw new Error("Invalid image path");
    }
    const catalog = /^\/p\/\d+$/.test(path.replace(/\/+$/, "") || "/")
      ? await loadMergedCatalog()
      : null;
    const seo = resolvePageSeo(path, catalog);
    const title = seo?.title || SITE_NAME;
    const svg = renderOgSvg({ title, kicker: kickerFor(path) });
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).send(svg);
  } catch (error) {
    console.error("og", error);
    res.status(500).json({ error: error?.message || String(error) });
  }
}
