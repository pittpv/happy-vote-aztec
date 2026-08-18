/**
 * Convert ZKPassport uniqueIdentifier → Field for on-chain identity_claims.
 * Prefer hex Field strings; otherwise SHA-256 the UTF-8 bytes into a Field.
 */

/**
 * @param {string} uniqueIdentifier
 * @param {typeof import("@aztec/aztec.js/fields").Fr} Fr
 */
export async function identityCommitmentFromUid(uniqueIdentifier, Fr) {
  if (!Fr) throw new Error("Fr constructor is required");
  const raw = String(uniqueIdentifier || "").trim();
  if (!raw) throw new Error("uniqueIdentifier is empty");

  if (/^0x[0-9a-fA-F]{1,64}$/.test(raw)) {
    return Fr.fromString(raw);
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Fr.fromString(`0x${raw}`);
  }
  // Decimal bigint string (common for field-ish IDs)
  if (/^\d+$/.test(raw)) {
    return new Fr(BigInt(raw));
  }

  const bytes = new TextEncoder().encode(raw);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  if (typeof Fr.fromBufferReduce === "function") {
    return Fr.fromBufferReduce(digest);
  }
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Fr(BigInt(`0x${hex}`) % Fr.MODULUS);
}

/**
 * Server re-verify ZKPassport proofs. Returns uniqueIdentifier on success.
 * @param {object} payload
 */
export async function reverifyZkPassport(payload) {
  const response = await fetch("/api/zkpassport-verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || !data.verified) {
    throw new Error(data.error || `ZKPassport re-verify failed (${response.status})`);
  }
  if (!data.uniqueIdentifier) {
    throw new Error("Re-verify returned no uniqueIdentifier");
  }
  return data;
}

const ZK_SESSION_KEY = "happyvote.aztec.zkid.v1";
const ZK_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function requirementsFingerprint(requirements) {
  if (!requirements || typeof requirements !== "object") return "";
  return JSON.stringify(requirements);
}

function readZkSessionMap() {
  if (typeof localStorage === "undefined") return {};
  const raw = localStorage.getItem(ZK_SESSION_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Corrupt ZKPassport session storage");
  }
  return parsed;
}

/**
 * Persist a successful ZKPassport check so iOS Safari reloads (wallet popup / memory)
 * do not force the voter to scan again.
 */
export function saveZkSession(pollId, { uniqueIdentifier, serverVerified, mock, requirements }) {
  const id = String(uniqueIdentifier || "").trim();
  if (!id) throw new Error("uniqueIdentifier is required to save ZKPassport session");
  const pollKey = String(pollId);
  if (!pollKey) throw new Error("pollId is required to save ZKPassport session");
  if (typeof localStorage === "undefined") return;
  let map = {};
  try {
    map = readZkSessionMap();
  } catch {
    map = {};
  }
  map[pollKey] = {
    uniqueIdentifier: id,
    serverVerified: Boolean(serverVerified),
    mock: Boolean(mock),
    req: requirementsFingerprint(requirements),
    at: Date.now(),
  };
  try {
    localStorage.setItem(ZK_SESSION_KEY, JSON.stringify(map));
  } catch (error) {
    console.error(error);
  }
}

/**
 * @returns {{ uniqueIdentifier: string, serverVerified: boolean, mock: boolean } | null}
 */
export function loadZkSession(pollId, { requirements } = {}) {
  if (typeof localStorage === "undefined") return null;
  const pollKey = String(pollId ?? "");
  if (!pollKey) return null;
  let map;
  try {
    map = readZkSessionMap();
  } catch {
    return null;
  }
  const row = map[pollKey];
  if (!row || typeof row !== "object") return null;
  const id = String(row.uniqueIdentifier || "").trim();
  if (!id) return null;
  const at = Number(row.at);
  if (!Number.isFinite(at) || Date.now() - at > ZK_SESSION_MAX_AGE_MS) return null;
  if (requirements && row.req && row.req !== requirementsFingerprint(requirements)) {
    return null;
  }
  return {
    uniqueIdentifier: id,
    serverVerified: Boolean(row.serverVerified),
    mock: Boolean(row.mock),
  };
}
