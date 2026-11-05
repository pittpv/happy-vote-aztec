/**
 * Verify a user-created poll against the chain before it is listed.
 * Aztec libraries load only on this path. A failed import rejects the listing.
 */
import {
  assertListingText,
  canonicalContent,
  canonicalListing,
  fieldFromUtf8,
  normalizeAddress,
  sameField,
} from "../src/lib/catalogMeta.js";
import {
  eligibilityModeFromAccountRules,
  normalizeAccountZkRules,
} from "../src/lib/zkRuleCanonical.js";

const SLOTS = {
  options_count: 2n,
  privacy_policy: 3n,
  eligibility_mode: 4n,
  metadata_hash: 5n,
  tally: 6n,
  total_votes: 7n,
  vote_ended: 8n,
  identity_claims: 12n,
  sealed: 13n,
  starts_at: 14n,
  ends_at: 15n,
  cancelled: 16n,
};

const TAG_CREATOR = 200n;
const TAG_AUTHOR = 205n;
const TAG_FEE = 201n;
const TAG_POOL = 202n;
const TAG_PUBX = 203n;
const TAG_PUBY = 204n;

const FEE_NAMES = ["sponsored", "voter", "pool"];
const FALLBACK_NAMES = ["stop", "voter"];

function requiredEnv(name) {
  const value = process.env[name];
  if (value == null || String(value).trim() === "") {
    throw new Error(`${name} is not configured`);
  }
  return String(value).trim();
}

function padHex32(hex) {
  const h = String(hex).replace(/^0x/i, "").toLowerCase();
  return `0x${h.padStart(64, "0")}`;
}

function asBigInt(value) {
  if (value == null || value === "") throw new Error("Empty chain value");
  const raw = value && typeof value === "object" && "value" in value ? value.value : value;
  if (raw == null || raw === "") throw new Error("Empty chain value");
  return BigInt(raw);
}

async function rpcField(nodeUrl, contract, slot) {
  const response = await fetch(nodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "node_getPublicStorageAt",
      params: ["latest", padHex32(contract), padHex32(slot)],
    }),
  });
  const json = await response.json();
  if (!response.ok || json.error) {
    throw new Error(json?.error?.message || `Chain read failed (${response.status})`);
  }
  return asBigInt(json.result);
}

async function loadHash() {
  try {
    const [{ deriveStorageSlotInMap }, { Fr }] = await Promise.all([
      import("@aztec-labs/stdlib/hash"),
      import("@aztec-labs/aztec.js/fields"),
    ]);
    return { deriveStorageSlotInMap, Fr };
  } catch (error) {
    const wrapped = new Error(
      "Catalog signature check is unavailable until the Aztec libraries load on the server",
    );
    wrapped.cause = error;
    wrapped.code = "NO_AZTEC_LIBS";
    throw wrapped;
  }
}

async function mapSlot(hashApi, base, key) {
  const slot = await hashApi.deriveStorageSlotInMap(new hashApi.Fr(base), {
    toField: () => new hashApi.Fr(key),
  });
  return slot.toString();
}

/** Unread public storage is zero. An RPC error still throws. */
async function rpcFieldOrZero(nodeUrl, contract, slot) {
  const response = await fetch(nodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "node_getPublicStorageAt",
      params: ["latest", padHex32(contract), padHex32(slot)],
    }),
  });
  const json = await response.json();
  if (!response.ok || json.error) {
    throw new Error(json?.error?.message || `Chain read failed (${response.status})`);
  }
  const raw = json.result;
  const value = raw && typeof raw === "object" && "value" in raw ? raw.value : raw;
  if (value == null || value === "") return 0n;
  return BigInt(value);
}

async function verifySchnorr(messageField, signatureHex, x, y) {
  const { Schnorr, SchnorrSignature } = await import("@aztec-labs/foundation/crypto/schnorr");
  const { Fr } = await import("@aztec-labs/foundation/curves/bn254");
  const { Point } = await import("@aztec-labs/foundation/curves/grumpkin");
  const hex = String(signatureHex || "").trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== 128) {
    throw new Error("Catalog signature must be 64 bytes");
  }
  const schnorr = new Schnorr();
  const message = new Fr(BigInt(messageField));
  const signature = new SchnorrSignature(Buffer.from(hex, "hex"));
  const point = new Point(new Fr(BigInt(x)), new Fr(BigInt(y)), false);
  const ok = await schnorr.verifySignature(message, point, signature);
  if (!ok) throw new Error("Catalog signature does not match the creator signing key");
}

function isoFromUnix(seconds) {
  if (seconds === 0n) return null;
  return new Date(Number(seconds) * 1000).toISOString();
}

/**
 * @param {object} raw account poll body plus signature and signing public key
 * @returns {Promise<object>} catalog record with server-derived storage slots
 */
export async function verifyAccountPoll(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Invalid account poll");
  const poll = raw.poll && typeof raw.poll === "object" ? raw.poll : raw;
  const text = assertListingText(poll);
  const zk = poll.zkRequirements == null ? null : normalizeAccountZkRules(poll.zkRequirements);
  const derivedMode = zk ? eligibilityModeFromAccountRules(zk) : 0;
  const contract = requiredEnv("VITE_HAPPY_VOTE_CONTRACT_ADDRESS");
  const nodeUrl = requiredEnv("VITE_AZTEC_NODE_URL");
  const pollId = String(poll.id || "").trim();
  if (!/^[1-9]\d*$/.test(pollId)) throw new Error("poll.id must be a positive integer string");
  const hiddenAuthor = raw.hiddenAuthor === true || poll.hiddenAuthor === true;
  let creator = null;
  if (hiddenAuthor) {
    if (poll.creator) {
      throw new Error("A private author listing cannot include an address");
    }
  } else {
    creator = normalizeAddress(poll.creator);
  }
  const publicKey = raw.signingPublicKey;
  if (!publicKey || publicKey.x == null || publicKey.y == null) {
    throw new Error("Signing public key is required");
  }
  const x = BigInt(publicKey.x);
  const y = BigInt(publicKey.y);
  if (x === 0n && y === 0n) throw new Error("Signing public key is required");

  const contentHash = await fieldFromUtf8(
    canonicalContent({
      title: text.title,
      description: text.description,
      options: text.labels,
      zk,
    }),
  );
  const listingHash = await fieldFromUtf8(
    canonicalListing({
      contract,
      pollId,
      title: text.title,
      description: text.description,
      options: text.labels,
      topics: text.topics,
      zk,
    }),
  );
  await verifySchnorr(listingHash, raw.signature, x, y);

  const hashApi = await loadHash();
  const idKey = BigInt(pollId);
  const slots = {};
  for (const [name, base] of Object.entries(SLOTS)) {
    if (name === "identity_claims") continue;
    slots[name] = await mapSlot(hashApi, base, idKey);
  }

  const [creatorSlot, feeSlot, poolSlot, xSlot, ySlot, commitmentSlot] = await Promise.all([
    ...[TAG_CREATOR, TAG_FEE, TAG_POOL, TAG_PUBX, TAG_PUBY, TAG_AUTHOR].map((tag) =>
      mapSlot(hashApi, BigInt(slots.tally), tag),
    ),
  ]);
  const [
    chainHash,
    chainCreator,
    chainX,
    chainY,
    chainOptions,
    chainFeePacked,
    chainEnds,
    chainStarts,
    chainEligibility,
    chainCommitment,
  ] = await Promise.all([
    rpcField(nodeUrl, contract, slots.metadata_hash),
    rpcField(nodeUrl, contract, creatorSlot),
    rpcField(nodeUrl, contract, xSlot),
    rpcField(nodeUrl, contract, ySlot),
    rpcField(nodeUrl, contract, slots.options_count),
    rpcField(nodeUrl, contract, feeSlot),
    rpcField(nodeUrl, contract, slots.ends_at),
    rpcField(nodeUrl, contract, slots.starts_at),
    rpcField(nodeUrl, contract, slots.eligibility_mode),
    rpcFieldOrZero(nodeUrl, contract, commitmentSlot),
  ]);

  if (chainHash !== BigInt(contentHash)) {
    throw new Error("metadata_hash does not match the title, description, and options");
  }
  if (hiddenAuthor) {
    if (chainCreator !== 0n) throw new Error("This poll stores a public author");
    if (chainCommitment === 0n) throw new Error("This poll has no private author commitment");
  } else {
    if (chainCreator !== BigInt(creator)) {
      throw new Error("Creator does not match the account that published the poll");
    }
    if (chainCommitment !== 0n) throw new Error("This poll hides its author");
  }
  if (chainX !== x || chainY !== y) {
    throw new Error("Signing key does not match the key stored with the poll");
  }
  if (chainOptions !== BigInt(text.labels.length)) {
    throw new Error("Option count does not match the chain");
  }
  const chainFee = chainFeePacked % 16n;
  const chainFallback = chainFeePacked / 16n;
  if (chainFee > 2n || chainFallback > 1n) throw new Error("Fee mode on the poll is not valid");
  if (chainEnds === 0n) throw new Error("The poll has no end on the chain");
  if (chainEligibility !== BigInt(derivedMode)) {
    throw new Error("Eligibility on the poll does not match the identity rules");
  }

  const endsAt = isoFromUnix(chainEnds);
  const startsAt = isoFromUnix(chainStarts);
  if (poll.endsAt && Math.floor(Date.parse(poll.endsAt) / 1000) !== Number(chainEnds)) {
    throw new Error("endsAt does not match the chain");
  }
  if (poll.startsAt && Math.floor(Date.parse(poll.startsAt) / 1000) !== Number(chainStarts)) {
    throw new Error("startsAt does not match the chain");
  }

  const tallySlots = [];
  for (let i = 0; i < text.labels.length; i++) {
    tallySlots.push(await mapSlot(hashApi, BigInt(slots.tally), BigInt(i)));
  }

  const privacy = Number(poll.privacyPolicy ?? 2);
  if (![0, 1, 2].includes(privacy)) throw new Error("Invalid privacy");
  const eligibility = derivedMode;

  return {
    id: pollId,
    title: text.title,
    description: text.description || undefined,
    topics: text.topics,
    countries: zk ? [...new Set([...zk.nationalityIn, ...zk.issuedBy])].sort() : [],
    options: text.labels.map((label, index) => {
      const rawOption = Array.isArray(poll.options) ? poll.options[index] : null;
      const rawLabel =
        rawOption && typeof rawOption === "object"
          ? String(rawOption.label || "").trim()
          : String(rawOption || "").trim();
      const note =
        rawOption && typeof rawOption === "object" ? String(rawOption.description || "").trim() : "";
      if (note && rawLabel === label && note.length <= 160) return { label, description: note };
      return { label };
    }),
    template: text.labels.length === 2 ? "binary" : "single_choice",
    requiresZkPassport: eligibility > 0,
    eligibilityMode: eligibility,
    privacyPolicy: privacy,
    voteFrequency: Number(poll.voteFrequency) === 1 ? 1 : 0,
    zkRequirements: zk,
    sealed: Boolean(poll.sealed),
    startsAt,
    endsAt,
    showOnHome: false,
    homeRank: Number(pollId),
    metadataHash: contentHash,
    publishedAt: new Date().toISOString(),
    publisher: "account",
    ...(hiddenAuthor ? { hiddenAuthor: true } : { creator }),
    feeMode: FEE_NAMES[Number(chainFee)],
    feeFallback: FALLBACK_NAMES[Number(chainFallback)],
    hidden: false,
    storageSlots: {
      tallies: tallySlots,
      total: slots.total_votes,
      policy: slots.privacy_policy,
      voteEnded: slots.vote_ended,
      sealed: slots.sealed,
      startsAt: slots.starts_at,
      endsAt: slots.ends_at,
      cancelled: slots.cancelled,
      poolRemaining: poolSlot,
    },
  };
}

async function poseidonMarker(hashApi, fields) {
  const { poseidon2Hash } = await import("@aztec-labs/foundation/crypto/poseidon");
  const marker = await poseidon2Hash(fields);
  return BigInt(marker.toString());
}

const CREATOR_OPEN_TAGS = [210n, 211n, 212n];

async function readPollChainRow(hashApi, nodeUrl, contract, pollId) {
  const idKey = BigInt(pollId);
  const tallyRoot = await mapSlot(hashApi, SLOTS.tally, idKey);
  const [endedSlot, cancelledSlot, endsSlot, hashSlot, xSlot] = await Promise.all([
    mapSlot(hashApi, SLOTS.vote_ended, idKey),
    mapSlot(hashApi, SLOTS.cancelled, idKey),
    mapSlot(hashApi, SLOTS.ends_at, idKey),
    mapSlot(hashApi, SLOTS.metadata_hash, idKey),
    mapSlot(hashApi, BigInt(tallyRoot), TAG_PUBX),
  ]);
  const [voteEnded, cancelled, endsAt, metadataHash, signingPubX] = await Promise.all([
    rpcFieldOrZero(nodeUrl, contract, endedSlot),
    rpcFieldOrZero(nodeUrl, contract, cancelledSlot),
    rpcFieldOrZero(nodeUrl, contract, endsSlot),
    rpcFieldOrZero(nodeUrl, contract, hashSlot),
    rpcFieldOrZero(nodeUrl, contract, xSlot),
  ]);
  return {
    id: String(pollId),
    voteEnded: voteEnded !== 0n,
    cancelled: cancelled !== 0n,
    endsAt: isoFromUnix(endsAt),
    metadataHash: metadataHash.toString(),
    signingPubX: signingPubX.toString(),
  };
}

/**
 * The three open-poll slots stored under this account, plus chain closure for
 * those ids and any catalog ids the caller already knows.
 * @param {string} account
 * @param {string[]} pollIds
 */
export async function readCreatorChain(account, pollIds) {
  const contract = requiredEnv("VITE_HAPPY_VOTE_CONTRACT_ADDRESS");
  const nodeUrl = requiredEnv("VITE_AZTEC_NODE_URL");
  const hashApi = await loadHash();
  const creator = BigInt(normalizeAddress(account));
  const ownerRoot = await mapSlot(hashApi, SLOTS.tally, creator);
  const openIds = [];
  for (const tag of CREATOR_OPEN_TAGS) {
    const slot = await mapSlot(hashApi, BigInt(ownerRoot), tag);
    const value = await rpcFieldOrZero(nodeUrl, contract, slot);
    if (value !== 0n) openIds.push(value.toString());
  }
  const ids = [...new Set([...openIds, ...pollIds.map((id) => String(id))])];
  const rows = await Promise.all(
    ids.map((id) => readPollChainRow(hashApi, nodeUrl, contract, id)),
  );
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  return {
    openPolls: openIds.map((id) => byId[id]),
    byId,
  };
}

export async function readAuthoritativeFlag(account) {
  const contract = requiredEnv("VITE_HAPPY_VOTE_CONTRACT_ADDRESS");
  const nodeUrl = requiredEnv("VITE_AZTEC_NODE_URL");
  const hashApi = await loadHash();
  const marker = await poseidonMarker(hashApi, [
    new hashApi.Fr(normalizeAddress(account)),
    new hashApi.Fr(1),
    new hashApi.Fr(8),
  ]);
  const slot = await mapSlot(hashApi, SLOTS.identity_claims, marker);
  const value = await rpcField(nodeUrl, contract, slot);
  return value !== 0n;
}
