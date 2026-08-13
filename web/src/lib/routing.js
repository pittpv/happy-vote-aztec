/**
 * Client routes:
 *   /                 — poll catalog
 *   /p/:id            — poll detail / vote
 *   /admin            — admin import + create poll
 *   /legal/:slug      — Terms, Privacy, Cookies, Data Safety, GDPR
 */

import { getLegalNavItem } from "./legalDocs.js";

export function parseRoute(pathname = window.location.pathname) {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/admin") return { kind: "admin" };
  const legal = path.match(/^\/legal\/([a-z0-9-]+)$/);
  if (legal) {
    const slug = legal[1];
    if (getLegalNavItem(slug)) return { kind: "legal", slug };
  }
  const poll = path.match(/^\/p\/(\d+)$/);
  if (poll) return { kind: "poll", pollId: poll[1] };
  return { kind: "home" };
}

export function homePath() {
  return "/";
}

export function pollPath(pollId) {
  return `/p/${pollId}`;
}

export function adminPath() {
  return "/admin";
}

export function legalPath(slug) {
  return `/legal/${slug}`;
}

export function navigate(path, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
