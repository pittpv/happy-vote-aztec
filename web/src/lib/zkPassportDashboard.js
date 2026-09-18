/**
 * Public ZKPassport Dashboard config for this domain.
 * @see https://docs.zkpassport.id/getting-started/policies
 */

const DASHBOARD_API = "https://dashboard-api.zkpassport.id";

/** @type {Promise<object[]>|null} */
let policiesPromise = null;
/** @type {string|null} */
let policiesDomain = null;

export function zkPassportPublicDomain() {
  const fromEnv = import.meta.env?.VITE_ZKPASSPORT_DOMAIN;
  if (fromEnv != null && String(fromEnv).trim() !== "") {
    return String(fromEnv).trim();
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1") return host;
  }
  return "aztec.happyvote.xyz";
}

/**
 * @param {string} [domain]
 * @returns {Promise<object[]>}
 */
export async function fetchZkPassportPolicies(domain = zkPassportPublicDomain()) {
  if (!domain) throw new Error("ZKPassport domain is required to load Dashboard policies");
  if (policiesPromise && policiesDomain === domain) return policiesPromise;
  policiesDomain = domain;
  policiesPromise = loadPolicies(domain);
  try {
    return await policiesPromise;
  } catch (error) {
    policiesPromise = null;
    policiesDomain = null;
    throw error;
  }
}

async function fetchWithTimeout(url, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadPolicies(domain) {
  const url = `${DASHBOARD_API}/public/project?domain=${encodeURIComponent(domain)}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(
      `ZKPassport Dashboard config failed for '${domain}' (${response.status} ${response.statusText})`,
    );
  }
  const data = await response.json();
  if (!data || !Array.isArray(data.policies)) {
    throw new Error(`Invalid ZKPassport Dashboard config for '${domain}'`);
  }
  return data.policies;
}

/**
 * @param {object[]} policies
 * @param {string} policyId
 */
export function findDashboardPolicy(policies, policyId) {
  const id = String(policyId || "").trim();
  if (!id) throw new Error("policyId is required");
  const match = policies.find((p) => p && p.id === id);
  if (!match) {
    throw new Error(`ZKPassport Dashboard has no policy "${id}"`);
  }
  return match;
}
