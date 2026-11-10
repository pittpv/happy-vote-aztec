/**
 * Paths that must be a real file. The app shell is HTML, so returning it for
 * these URLs makes /llms.txt and /.well-known/ard.json look present and invalid.
 */
export function expectsStaticFile(pathname) {
  const path = String(pathname || "");
  if (path === "/.well-known" || path.startsWith("/.well-known/")) return true;
  const last = path.slice(path.lastIndexOf("/") + 1);
  return last.includes(".");
}

const DOCUMENT_PAGES = new Set(["/", "/polls", "/create", "/faq", "/admin"]);

/** App paths whose first HTML byte must already carry that page's head. */
export function documentPage(pathname) {
  const trimmed = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (DOCUMENT_PAGES.has(trimmed)) return trimmed;
  if (/^\/p\/[^/]+$/.test(trimmed)) return trimmed;
  if (/^\/legal\/[^/]+$/.test(trimmed)) return trimmed;
  return null;
}
