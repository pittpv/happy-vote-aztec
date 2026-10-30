/**
 * HTML shell with a unique head for crawlers.
 * The Vite app still hydrates this document and updates the same tags.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMergedCatalog } from "./poll-catalog.js";
import { applyHtmlSeo, pageTitle, webPageJsonLd } from "../src/lib/seo.js";
import { resolvePageSeo } from "../src/lib/resolvePageSeo.js";
import { SITE_DESCRIPTION, SITE_NAME } from "../src/lib/site.js";

const here = dirname(fileURLToPath(import.meta.url));
let shellHtml = null;

function requestPath(req) {
  const url = new URL(req.url || "/", "http://localhost");
  const raw = url.searchParams.get("path");
  if (!raw || !raw.startsWith("/") || raw.includes("..")) {
    throw new Error("Missing page path");
  }
  return raw.split("?")[0].split("#")[0];
}

async function loadShell() {
  if (shellHtml) return shellHtml;
  const files = [join(process.cwd(), "dist", "index.html"), join(here, "..", "dist", "index.html")];
  for (const file of files) {
    try {
      const html = await readFile(file, "utf8");
      if (!html.includes('id="root"')) continue;
      shellHtml = html;
      return html;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const host = process.env.VERCEL_URL;
  if (!host) throw new Error("Built index.html was not found");
  const response = await fetch(`https://${host}/index.html`, { redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("index.html redirected; refusing to follow it back into the page handler");
  }
  if (!response.ok) throw new Error(`index.html HTTP ${response.status}`);
  const html = await response.text();
  if (!html.includes('id="root"')) throw new Error("index.html is missing #root");
  shellHtml = html;
  return html;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const path = requestPath(req);
    const catalog = /^\/p\/\d+$/.test(path.replace(/\/+$/, "") || "/")
      ? await loadMergedCatalog()
      : null;
    const seo =
      resolvePageSeo(path, catalog) || {
        title: pageTitle("Not found"),
        description: SITE_DESCRIPTION,
        path,
        noindex: true,
        jsonLd: webPageJsonLd({
          title: pageTitle("Not found"),
          description: SITE_DESCRIPTION,
          path,
          breadcrumbs: [{ name: SITE_NAME, path: "/" }],
        }),
      };
    const html = applyHtmlSeo(await loadShell(), seo);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      seo.noindex
        ? "public, max-age=0, s-maxage=60"
        : path.startsWith("/p/")
          ? "public, s-maxage=60, stale-while-revalidate=300"
          : "public, s-maxage=300, stale-while-revalidate=86400",
    );
    if (seo.noindex) res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(200).send(html);
  } catch (error) {
    console.error("document", error);
    res.status(500).json({ error: error?.message || String(error) });
  }
}
