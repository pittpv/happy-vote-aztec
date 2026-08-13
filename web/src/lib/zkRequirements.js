/**
 * Off-chain ZKPassport eligibility requirements for a poll.
 * On-chain: eligibility_mode (0 open / 1 personhood / 2 gated) + metadata_hash.
 *
 * Query mapping mirrors @zkpassport/sdk builder (Dashboard Create Policy UI).
 */

import { DOCUMENT_TYPE_OPTIONS } from "./countries.js";

export const ELIGIBILITY_MODE = {
  OPEN: 0,
  PERSONHOOD: 1,
  GATED: 2,
};

/** @deprecated prefer ALL_COUNTRIES — kept for older presets */
export const NATIONALITY_PRESETS = [
  { code: "USA", label: "United States" },
  { code: "GBR", label: "United Kingdom" },
  { code: "DEU", label: "Germany" },
  { code: "FRA", label: "France" },
  { code: "RUS", label: "Russia" },
  { code: "UKR", label: "Ukraine" },
  { code: "POL", label: "Poland" },
  { code: "ESP", label: "Spain" },
  { code: "ITA", label: "Italy" },
  { code: "NLD", label: "Netherlands" },
  { code: "CAN", label: "Canada" },
  { code: "AUS", label: "Australia" },
  { code: "JPN", label: "Japan" },
  { code: "BRA", label: "Brazil" },
  { code: "IND", label: "India" },
];

const DOC_IDS = new Set(DOCUMENT_TYPE_OPTIONS.map((d) => d.id));

/**
 * @typedef {object} ZkPassportRequirements
 * @property {boolean} personhood
 * @property {number|null} minAge
 * @property {number|null} maxAge
 * @property {string|null} bornAfter  YYYY-MM-DD
 * @property {string|null} bornBefore YYYY-MM-DD
 * @property {string[]} nationalityIn
 * @property {string[]} nationalityOut
 * @property {string[]} documentTypes  passport | id_card | residence_permit
 * @property {string|null} expiresAfter  YYYY-MM-DD
 * @property {string|null} expiresBefore YYYY-MM-DD
 * @property {string[]} issuedBy
 * @property {string[]} notIssuedBy
 * @property {boolean} sanctions
 * @property {boolean} facematchStrict
 * @property {string|null} policyId
 * @property {string} purpose
 */

/** @returns {ZkPassportRequirements} */
export function defaultZkRequirements() {
  return {
    personhood: true,
    minAge: null,
    maxAge: null,
    bornAfter: null,
    bornBefore: null,
    nationalityIn: [],
    nationalityOut: [],
    documentTypes: [],
    expiresAfter: null,
    expiresBefore: null,
    issuedBy: [],
    notIssuedBy: [],
    sanctions: false,
    facematchStrict: false,
    policyId: null,
    purpose: "Prove eligibility to vote on HappyVote on Aztec",
  };
}

export function normalizeCountryCodes(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const code = String(raw || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      throw new Error(`Invalid nationality code "${raw}" (need ISO alpha-3, e.g. USA)`);
    }
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out.sort();
}

function normalizeOptionalDate(raw, label) {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}`);
  return s;
}

function parseOptionalAge(raw, label) {
  if (raw == null || raw === "" || Number(raw) === 0) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 120) {
    throw new Error(`${label} must be an integer 1–120`);
  }
  return n;
}

/**
 * Accept Dashboard policy ids (`pol_…`) or slugs/names.
 */
export function normalizePolicyId(raw) {
  const id = String(raw || "").trim();
  if (!id) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,120}$/.test(id)) {
    throw new Error(
      `Invalid policy id "${raw}" — use Dashboard id (pol_…) or slug (e.g. vote-identity-verification)`,
    );
  }
  return id;
}

export function getDefaultZkPassportPolicyId() {
  const fromEnv = import.meta.env?.VITE_ZKPASSPORT_DEFAULT_POLICY;
  if (fromEnv == null || String(fromEnv).trim() === "") return null;
  return normalizePolicyId(String(fromEnv).trim());
}

/**
 * Use poll requirements as-is. Do not inject env default policy
 * (that hid admin-configured predicates).
 */
export function resolveEffectiveZkRequirements(req) {
  return normalizeZkRequirements(req ?? defaultZkRequirements());
}

/**
 * @param {Partial<ZkPassportRequirements>} input
 * @returns {ZkPassportRequirements}
 */
export function normalizeZkRequirements(input = {}) {
  const base = defaultZkRequirements();
  const minAge = parseOptionalAge(input.minAge, "minAge");
  const maxAge = parseOptionalAge(input.maxAge, "maxAge");
  if (minAge != null && maxAge != null && minAge > maxAge) {
    throw new Error("minAge cannot be greater than maxAge");
  }

  const bornAfter = normalizeOptionalDate(input.bornAfter, "bornAfter");
  const bornBefore = normalizeOptionalDate(input.bornBefore, "bornBefore");
  if (bornAfter && bornBefore && bornAfter > bornBefore) {
    throw new Error("bornAfter cannot be after bornBefore");
  }

  const expiresAfter = normalizeOptionalDate(input.expiresAfter, "expiresAfter");
  const expiresBefore = normalizeOptionalDate(input.expiresBefore, "expiresBefore");
  if (expiresAfter && expiresBefore && expiresAfter > expiresBefore) {
    throw new Error("expiresAfter cannot be after expiresBefore");
  }

  const nationalityIn = normalizeCountryCodes(input.nationalityIn ?? []);
  const nationalityOut = normalizeCountryCodes(input.nationalityOut ?? []);
  for (const code of nationalityIn) {
    if (nationalityOut.includes(code)) {
      throw new Error(`Nationality ${code} cannot be both included and excluded`);
    }
  }

  const issuedBy = normalizeCountryCodes(input.issuedBy ?? []);
  const notIssuedBy = normalizeCountryCodes(input.notIssuedBy ?? []);
  for (const code of issuedBy) {
    if (notIssuedBy.includes(code)) {
      throw new Error(`Issuing country ${code} cannot be both included and excluded`);
    }
  }

  const documentTypes = [];
  const seenDoc = new Set();
  for (const raw of input.documentTypes ?? []) {
    const id = String(raw || "").trim();
    if (!DOC_IDS.has(id)) {
      throw new Error(`Invalid document type "${raw}"`);
    }
    if (seenDoc.has(id)) continue;
    seenDoc.add(id);
    documentTypes.push(id);
  }
  if (documentTypes.length > 1) {
    throw new Error(
      "SDK supports one document type per query — pick a single type, or use a Dashboard policy id for multi-type OR",
    );
  }

  const policyId =
    input.policyId == null || String(input.policyId).trim() === ""
      ? null
      : normalizePolicyId(String(input.policyId).trim());

  const purpose =
    input.purpose == null || String(input.purpose).trim() === ""
      ? base.purpose
      : String(input.purpose).trim().slice(0, 280);

  const personhood = input.personhood !== false;
  const sanctions = Boolean(input.sanctions);
  const facematchStrict = Boolean(input.facematchStrict);

  if (facematchStrict && !personhood) {
    throw new Error("FaceMatch strict requires personhood");
  }

  return {
    personhood,
    minAge,
    maxAge,
    bornAfter,
    bornBefore,
    nationalityIn,
    nationalityOut,
    documentTypes,
    expiresAfter,
    expiresBefore,
    issuedBy,
    notIssuedBy,
    sanctions,
    facematchStrict,
    policyId,
    purpose,
  };
}

function hasPredicateBeyondPersonhood(r) {
  return (
    r.minAge != null ||
    r.maxAge != null ||
    Boolean(r.bornAfter) ||
    Boolean(r.bornBefore) ||
    r.nationalityIn.length > 0 ||
    r.nationalityOut.length > 0 ||
    r.documentTypes.length > 0 ||
    Boolean(r.expiresAfter) ||
    Boolean(r.expiresBefore) ||
    r.issuedBy.length > 0 ||
    r.notIssuedBy.length > 0 ||
    r.sanctions ||
    r.facematchStrict ||
    Boolean(r.policyId)
  );
}

/** True when any predicate beyond bare personhood is set. */
export function isGatedRequirements(req) {
  return hasPredicateBeyondPersonhood(normalizeZkRequirements(req));
}

export function eligibilityModeFromRequirements(req) {
  if (!req) return ELIGIBILITY_MODE.OPEN;
  const r = normalizeZkRequirements(req);
  if (!r.personhood && !hasPredicateBeyondPersonhood(r)) return ELIGIBILITY_MODE.OPEN;
  return hasPredicateBeyondPersonhood(r) ? ELIGIBILITY_MODE.GATED : ELIGIBILITY_MODE.PERSONHOOD;
}

export function canonicalizeZkRequirements(req) {
  const r = normalizeZkRequirements(req);
  return JSON.stringify({
    bornAfter: r.bornAfter,
    bornBefore: r.bornBefore,
    documentTypes: r.documentTypes,
    expiresAfter: r.expiresAfter,
    expiresBefore: r.expiresBefore,
    facematchStrict: r.facematchStrict,
    issuedBy: r.issuedBy,
    maxAge: r.maxAge,
    minAge: r.minAge,
    nationalityIn: r.nationalityIn,
    nationalityOut: r.nationalityOut,
    notIssuedBy: r.notIssuedBy,
    personhood: r.personhood,
    policyId: r.policyId,
    purpose: r.purpose,
    sanctions: r.sanctions,
  });
}

export function describeZkRequirements(req) {
  const r = normalizeZkRequirements(req);
  const lines = [];
  if (r.policyId) {
    lines.push(`Dashboard policy ${r.policyId}`);
    return lines;
  }
  if (r.personhood) lines.push("Unique personhood (anti-sybil)");
  if (r.minAge != null) lines.push(`Age ≥ ${r.minAge}`);
  if (r.maxAge != null) lines.push(`Age ≤ ${r.maxAge}`);
  if (r.bornAfter) lines.push(`Born on or after ${r.bornAfter}`);
  if (r.bornBefore) lines.push(`Born on or before ${r.bornBefore}`);
  if (r.nationalityIn.length) lines.push(`Nationality in: ${r.nationalityIn.join(", ")}`);
  if (r.nationalityOut.length) lines.push(`Nationality not in: ${r.nationalityOut.join(", ")}`);
  if (r.documentTypes.length) {
    const labels = r.documentTypes.map(
      (id) => DOCUMENT_TYPE_OPTIONS.find((d) => d.id === id)?.label || id,
    );
    lines.push(`Document type: ${labels.join(", ")}`);
  }
  if (r.expiresAfter) lines.push(`Document expires after ${r.expiresAfter}`);
  if (r.expiresBefore) lines.push(`Document expires before ${r.expiresBefore}`);
  if (r.issuedBy.length) lines.push(`Issued by: ${r.issuedBy.join(", ")}`);
  if (r.notIssuedBy.length) lines.push(`Not issued by: ${r.notIssuedBy.join(", ")}`);
  if (r.sanctions) lines.push("Sanctions screening");
  if (r.facematchStrict) lines.push("FaceMatch (strict)");
  if (lines.length === 0) lines.push("No ZKPassport checks (open eligibility)");
  return lines;
}

function parseDate(iso) {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Apply requirements to a ZKPassport query builder.
 * If `policyId` is set, uses `.policy(id)` alone (dashboard-locked query).
 */
export function applyZkRequirementsToQuery(queryBuilder, req) {
  const r = normalizeZkRequirements(req);
  if (r.policyId) {
    return queryBuilder.policy(r.policyId).done();
  }
  let q = queryBuilder;
  if (r.minAge != null) q = q.gte("age", r.minAge);
  if (r.maxAge != null) q = q.lte("age", r.maxAge);
  if (r.bornAfter) q = q.gte("birthdate", parseDate(r.bornAfter));
  if (r.bornBefore) q = q.lte("birthdate", parseDate(r.bornBefore));
  if (r.nationalityIn.length) q = q.in("nationality", r.nationalityIn);
  if (r.nationalityOut.length) q = q.out("nationality", r.nationalityOut);
  if (r.documentTypes.length === 1) q = q.eq("document_type", r.documentTypes[0]);
  if (r.expiresAfter) q = q.gte("expiry_date", parseDate(r.expiresAfter));
  if (r.expiresBefore) q = q.lte("expiry_date", parseDate(r.expiresBefore));
  if (r.issuedBy.length) q = q.in("issuing_country", r.issuedBy);
  if (r.notIssuedBy.length) q = q.out("issuing_country", r.notIssuedBy);
  if (r.sanctions) q = q.sanctions();
  if (r.facematchStrict) q = q.facematch("strict");
  return q.done();
}

export async function hashZkRequirementsToField(req, Fr) {
  if (!Fr) throw new Error("Fr constructor is required");
  const canonical = canonicalizeZkRequirements(req);
  const bytes = new TextEncoder().encode(canonical);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  // SHA-256 can exceed BN254 modulus — reduce into the field.
  if (typeof Fr.fromBufferReduce === "function") {
    return Fr.fromBufferReduce(digest);
  }
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  const reduced = BigInt(`0x${hex}`) % Fr.MODULUS;
  return new Fr(reduced);
}

export function hashZkRequirementsToHex(req) {
  const s = canonicalizeZkRequirements(req);
  let h0 = 2166136261;
  let h1 = 2166136261 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h0 = Math.imul(h0 ^ c, 16777619) >>> 0;
    h1 = Math.imul(h1 ^ (c + i), 16777619) >>> 0;
  }
  const part = (n) => n.toString(16).padStart(8, "0");
  return `0x${part(h0)}${part(h1)}${part(h0 ^ h1)}${part(~h0 >>> 0)}${part(h0)}${part(h1)}${part(h0 ^ 0xabcdef)}${part(h1 ^ 0x123456)}`;
}

/** Country codes referenced by requirements (for catalog filters). */
export function countriesFromRequirements(req) {
  if (!req) return [];
  try {
    const r = normalizeZkRequirements(req);
    return [...new Set([...r.nationalityIn, ...r.issuedBy])].sort();
  } catch {
    return [];
  }
}
