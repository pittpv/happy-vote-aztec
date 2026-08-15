/**
 * Cookieless first-party pageview ping. No cookies, no localStorage, no fingerprint.
 * Unique estimates live on the server for a single UTC day.
 */

const SKIP_MS = 1000;
let lastPing = { path: "", at: 0 };

function privacyOptOut() {
  if (typeof navigator === "undefined") return true;
  const dnt = navigator.doNotTrack || navigator.msDoNotTrack;
  if (dnt === "1" || dnt === "yes") return true;
  if (navigator.globalPrivacyControl === true) return true;
  return false;
}

/**
 * Record one SPA view. Safe to call on every route change.
 * @param {string} [pathname]
 */
export function trackPageview(pathname) {
  if (typeof window === "undefined") return;
  if (privacyOptOut()) return;
  const path = String(pathname || window.location.pathname || "/").split("?")[0];
  if (path === "/admin" || path.startsWith("/admin/")) return;
  const now = Date.now();
  if (path === lastPing.path && now - lastPing.at < SKIP_MS) return;
  lastPing = { path, at: now };

  const body = JSON.stringify({
    path,
    referrer: typeof document !== "undefined" ? document.referrer || "" : "",
  });
  try {
    void fetch("/api/site-stats", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
      mode: "same-origin",
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

function publishToken() {
  return (
    (typeof sessionStorage !== "undefined" && sessionStorage.getItem("happyvote.publishToken")) ||
    import.meta.env.VITE_POLLS_PUBLISH_TOKEN ||
    ""
  );
}

/**
 * Operator-only aggregate read.
 * @param {{ token?: string, days?: number }} [opts]
 */
export async function fetchSiteStats({ token, days = 14 } = {}) {
  const auth = token || publishToken();
  if (!auth) {
    return { ok: false, error: "Missing operator token" };
  }
  const response = await fetch(`/api/site-stats?days=${encodeURIComponent(days)}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${auth}`,
    },
    credentials: "omit",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    return {
      ok: false,
      error: data.error || `HTTP ${response.status}`,
    };
  }
  return data;
}
