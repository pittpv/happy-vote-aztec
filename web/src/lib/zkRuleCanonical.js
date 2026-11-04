/**
 * ZKPassport rules for a user-created poll.
 * No country catalog import: the polls API loads this module on the publish path.
 * Dashboard policy ids are rejected. Those queries belong to the site operator.
 */

export const ACCOUNT_ZK_PURPOSE = "Prove eligibility to vote on HappyVote on Aztec";

const DOCUMENT_TYPES = new Set(["passport", "id_card", "residence_permit"]);

function optionalDate(raw, label) {
  if (raw == null || String(raw).trim() === "") return null;
  const text = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${label}`);
  return text;
}

function optionalAge(raw, label) {
  if (raw == null || raw === "" || Number(raw) === 0) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    throw new Error(`${label} must be an integer 1–99`);
  }
  return value;
}

function countryCodes(list, label) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const code = String(raw || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw new Error(`${label} must be ISO alpha-3 codes`);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out.sort();
}

function documentTypes(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const id = String(raw || "").trim();
    if (!id) continue;
    if (!DOCUMENT_TYPES.has(id)) throw new Error("Invalid document type");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length > 1) throw new Error("Pick one document type");
  return out;
}

/**
 * @param {object} input
 * @returns {object} canonical rules, key order stable for the catalog signature
 */
export function normalizeAccountZkRules(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Identity rules are missing");
  }
  if (input.policyId != null && String(input.policyId).trim() !== "") {
    throw new Error("A Dashboard policy id cannot be set on this poll");
  }
  if (input.personhood === false) throw new Error("Personhood is required");

  const minAge = optionalAge(input.minAge, "Minimum age");
  const maxAge = optionalAge(input.maxAge, "Maximum age");
  if (minAge != null && maxAge != null && minAge > maxAge) {
    throw new Error("Minimum age cannot be greater than maximum age");
  }
  const bornAfter = optionalDate(input.bornAfter, "Born after");
  const bornBefore = optionalDate(input.bornBefore, "Born before");
  if (bornAfter && bornBefore && bornAfter > bornBefore) {
    throw new Error("Born after cannot be later than born before");
  }
  const expiresAfter = optionalDate(input.expiresAfter, "Expires after");
  const expiresBefore = optionalDate(input.expiresBefore, "Expires before");
  if (expiresAfter && expiresBefore && expiresAfter > expiresBefore) {
    throw new Error("Expires after cannot be later than expires before");
  }

  const nationalityIn = countryCodes(input.nationalityIn, "Nationality");
  const nationalityOut = countryCodes(input.nationalityOut, "Excluded nationality");
  for (const code of nationalityIn) {
    if (nationalityOut.includes(code)) {
      throw new Error(`Nationality ${code} cannot be both included and excluded`);
    }
  }
  const issuedBy = countryCodes(input.issuedBy, "Issuing country");
  const notIssuedBy = countryCodes(input.notIssuedBy, "Excluded issuing country");
  for (const code of issuedBy) {
    if (notIssuedBy.includes(code)) {
      throw new Error(`Issuing country ${code} cannot be both included and excluded`);
    }
  }

  const purpose =
    input.purpose == null || String(input.purpose).trim() === ""
      ? ACCOUNT_ZK_PURPOSE
      : String(input.purpose).trim().slice(0, 280);

  return {
    bornAfter,
    bornBefore,
    documentTypes: documentTypes(input.documentTypes),
    expiresAfter,
    expiresBefore,
    facematchStrict: Boolean(input.facematchStrict),
    issuedBy,
    maxAge,
    minAge,
    nationalityIn,
    nationalityOut,
    notIssuedBy,
    personhood: true,
    purpose,
    sanctions: Boolean(input.sanctions),
  };
}

export function accountRulesAreGated(rules) {
  const r = normalizeAccountZkRules(rules);
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
    r.facematchStrict
  );
}

/** 1 personhood, 2 gated. Input must already be a ZK poll. */
export function eligibilityModeFromAccountRules(rules) {
  return accountRulesAreGated(rules) ? 2 : 1;
}

function datePart(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function listed(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node.in)) return node.in.map((code) => String(code).trim().toUpperCase());
  if (node.eq != null && String(node.eq).trim() !== "") return [String(node.eq).trim().toUpperCase()];
  return null;
}

function excluded(node) {
  if (!node || typeof node !== "object" || !Array.isArray(node.out)) return null;
  return node.out.map((code) => String(code).trim().toUpperCase());
}

function requireInclusion(node, required, label) {
  const got = listed(node);
  if (!got || got.length === 0) throw new Error(`${label} is missing from the identity check`);
  const allow = new Set(required);
  if (got.some((code) => !allow.has(code))) {
    throw new Error(`${label} is wider than this poll allows`);
  }
}

function hasSanctionsCheck(node) {
  if (node === true) return true;
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  if (node.eq === true) return true;
  return node.countries != null || node.lists != null || node.strict != null;
}

function requireExclusion(node, required, label) {
  const got = excluded(node);
  if (!got) throw new Error(`${label} is missing from the identity check`);
  const have = new Set(got);
  if (required.some((code) => !have.has(code))) {
    throw new Error(`${label} is narrower than this poll requires`);
  }
}

/**
 * The submitted ZKPassport query must enforce every rule stored for the poll.
 * A tighter query is accepted. A missing or wider check is rejected.
 * @param {object} query
 * @param {object} rules
 */
export function querySatisfiesAccountRules(query, rules) {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    throw new Error("Identity check is missing");
  }
  const r = normalizeAccountZkRules(rules);
  if (r.minAge != null) {
    const got = Number(query.age?.gte);
    if (!Number.isInteger(got) || got < r.minAge) throw new Error("Age check is weaker than this poll requires");
  }
  if (r.maxAge != null) {
    const got = Number(query.age?.lte);
    if (!Number.isInteger(got) || got > r.maxAge) throw new Error("Age check is weaker than this poll requires");
  }
  if (r.bornAfter) {
    const got = datePart(query.birthdate?.gte);
    if (!got || got < r.bornAfter) throw new Error("Birthdate check is weaker than this poll requires");
  }
  if (r.bornBefore) {
    const got = datePart(query.birthdate?.lte);
    if (!got || got > r.bornBefore) throw new Error("Birthdate check is weaker than this poll requires");
  }
  if (r.nationalityIn.length) requireInclusion(query.nationality, r.nationalityIn, "Nationality");
  if (r.nationalityOut.length) requireExclusion(query.nationality, r.nationalityOut, "Nationality exclusion");
  if (r.documentTypes.length) {
    const got = String(query.document_type?.eq || "").trim();
    if (got !== r.documentTypes[0]) throw new Error("Document type does not match this poll");
  }
  if (r.expiresAfter) {
    const got = datePart(query.expiry_date?.gte);
    if (!got || got < r.expiresAfter) throw new Error("Document expiry check is weaker than this poll requires");
  }
  if (r.expiresBefore) {
    const got = datePart(query.expiry_date?.lte);
    if (!got || got > r.expiresBefore) throw new Error("Document expiry check is weaker than this poll requires");
  }
  if (r.issuedBy.length) requireInclusion(query.issuing_country, r.issuedBy, "Issuing country");
  if (r.notIssuedBy.length) requireExclusion(query.issuing_country, r.notIssuedBy, "Issuing country exclusion");
  if (r.sanctions && !hasSanctionsCheck(query.sanctions)) {
    throw new Error("Sanctions check is missing from the identity check");
  }
  if (r.facematchStrict && query.facematch?.mode !== "strict" && query.facematch !== "strict") {
    throw new Error("FaceMatch check is missing from the identity check");
  }
}
