/**
 * Canonical poll text for the on-chain metadata hash and the catalog signature.
 * The chain binds title, description, and option labels. The signature also binds
 * the contract, poll id, and topics so a listing cannot be replayed.
 */

export const BN254_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const MAX_OPTION_LABEL = 80;
export const MAX_DESCRIPTION = 280;
export const MAX_TITLE = 140;
export const MAX_TOPICS = 8;
export const MAX_TOPIC_LENGTH = 32;
export const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export function optionLabels(options) {
  if (!Array.isArray(options)) return [];
  return options.map((option) => {
    if (typeof option === "string") return option.trim();
    return String(option?.label || "").trim();
  });
}

export function canonicalContent({ title, description, options }) {
  return JSON.stringify({
    description: String(description || "").trim(),
    options: optionLabels(options),
    title: String(title || "").trim(),
  });
}

export function canonicalListing({ contract, pollId, title, description, options, topics }) {
  return JSON.stringify({
    contract: String(contract || "").trim().toLowerCase(),
    description: String(description || "").trim(),
    options: optionLabels(options),
    pollId: String(pollId),
    title: String(title || "").trim(),
    topics: normalizeTopics(topics),
  });
}

export function normalizeTopics(topics) {
  if (!Array.isArray(topics)) return [];
  return topics.map((topic) => String(topic || "").trim().toLowerCase()).filter(Boolean);
}

export async function fieldFromUtf8(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  const reduced = BigInt(`0x${hex}`) % BN254_MODULUS;
  return `0x${reduced.toString(16)}`;
}

export function normalizeAddress(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const hex = text.startsWith("0x") ? text.slice(2) : text;
  if (!/^[0-9a-f]+$/.test(hex) || hex.length < 1 || hex.length > 64) {
    throw new Error("Invalid Aztec address");
  }
  return `0x${hex.padStart(64, "0")}`;
}

export function sameField(left, right) {
  return BigInt(normalizeAddress(left)) === BigInt(normalizeAddress(right));
}

/**
 * Text limits for a user listing. Throws. Does not apply homepage flags.
 */
export function assertListingText({ title, description, options, topics }) {
  const name = String(title || "").trim();
  if (!name) throw new Error("Title is required");
  if (name.length > MAX_TITLE) throw new Error("Title is too long");
  const about = String(description || "").trim();
  if (about.length > MAX_DESCRIPTION) throw new Error("Description is too long");
  const labels = optionLabels(options);
  if (labels.length < 2) throw new Error("Need at least 2 options");
  if (labels.length > 32) throw new Error("At most 32 options");
  if (labels.some((label) => !label || label.length > MAX_OPTION_LABEL)) {
    throw new Error("Each option label must be 1–80 characters");
  }
  const tags = normalizeTopics(topics);
  if (tags.length > MAX_TOPICS) throw new Error("At most 8 topics");
  if (tags.some((tag) => tag.length > MAX_TOPIC_LENGTH)) throw new Error("Topic is too long");
  return { title: name, description: about, labels, topics: tags };
}
