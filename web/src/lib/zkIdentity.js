/**
 * Convert ZKPassport uniqueIdentifier → Field for on-chain identity_claims.
 * Prefer hex Field strings; otherwise SHA-256 the UTF-8 bytes into a Field.
 */

import { fieldFromDigest } from "./fieldFromDigest.js";

/**
 * @param {string} uniqueIdentifier
 * @param {typeof import("@aztec-labs/aztec.js/fields").Fr} Fr
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
  return fieldFromDigest(digest, Fr);
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
function validAttestation(value) {
  if (!value || typeof value !== "object") return null;
  const expiry = Number(value.expiry);
  const fields = ["identity", "period", "r", "s", "xHi", "xLo", "yHi", "yLo"];
  if (!Number.isFinite(expiry) || fields.some((key) => String(value[key] ?? "") === "")) return null;
  return {
    identity: String(value.identity),
    period: String(value.period),
    expiry,
    r: String(value.r),
    s: String(value.s),
    xHi: String(value.xHi),
    xLo: String(value.xLo),
    yHi: String(value.yHi),
    yLo: String(value.yLo),
  };
}

export function attestationBytes(hex) {
  const raw = String(hex || "").replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("Attestation is incomplete");
  const out = [];
  for (let i = 0; i < raw.length; i += 2) out.push(Number.parseInt(raw.slice(i, i + 2), 16));
  return out;
}

export function zeroAttestationBytes() {
  return Array(32).fill(0);
}

export function saveZkSession(pollId, { uniqueIdentifier, serverVerified, mock, requirements, attestation }) {
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
  const checked = validAttestation(attestation);
  map[pollKey] = {
    uniqueIdentifier: id,
    serverVerified: Boolean(serverVerified),
    mock: Boolean(mock),
    req: requirementsFingerprint(requirements),
    at: Date.now(),
    ...(checked ? { attestation: checked } : {}),
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
  const attestation = validAttestation(row.attestation);
  const fresh = attestation && attestation.expiry > Math.floor(Date.now() / 1000) + 30;
  return {
    uniqueIdentifier: id,
    serverVerified: Boolean(row.serverVerified),
    mock: Boolean(row.mock),
    attestation: fresh ? attestation : null,
  };
}
