/**
 * One-time Schnorr key for a catalog listing. The account key stays in the wallet.
 * This key is committed in create_user_poll and can sign only the text whose hash
 * is already on that poll. It lives in sessionStorage until the listing is stored.
 */
import { canonicalContent, canonicalListing, fieldFromUtf8 } from "./catalogMeta.js";

const DRAFT_KEY = "happyvote.aztec.catalogDraft.v1";

export function readCatalogDraft() {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (raw == null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Catalog draft in this tab is not valid JSON");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.signingKey ||
    parsed.publicKey?.x == null ||
    parsed.publicKey?.y == null ||
    !parsed.poll
  ) {
    throw new Error("Catalog draft in this tab is incomplete");
  }
  return parsed;
}

export function writeCatalogDraft(draft) {
  if (typeof sessionStorage === "undefined") {
    throw new Error("This browser cannot keep the catalog signing key for this tab");
  }
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearCatalogDraft() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(DRAFT_KEY);
}

export async function createCatalogSigningKey() {
  const { Schnorr } = await import("@aztec-labs/foundation/crypto/schnorr");
  const { GrumpkinScalar } = await import("@aztec-labs/foundation/curves/grumpkin");
  const signingKey = GrumpkinScalar.random();
  const point = await new Schnorr().computePublicKey(signingKey);
  return {
    signingKey: signingKey.toString(),
    publicKey: {
      x: BigInt(point.x.toString()).toString(),
      y: BigInt(point.y.toString()).toString(),
    },
  };
}

export async function catalogDraftContentHash(draft) {
  return fieldFromUtf8(
    canonicalContent({
      title: draft.poll.title,
      description: draft.poll.description,
      options: draft.poll.options,
      zk: draft.poll.zkRequirements,
    }),
  );
}

export async function signCatalogDraft(draft, pollId) {
  const contract = String(import.meta.env.VITE_HAPPY_VOTE_CONTRACT_ADDRESS || "");
  if (!contract) throw new Error("VITE_HAPPY_VOTE_CONTRACT_ADDRESS is not set");
  const { Schnorr } = await import("@aztec-labs/foundation/crypto/schnorr");
  const { Fr } = await import("@aztec-labs/foundation/curves/bn254");
  const { GrumpkinScalar } = await import("@aztec-labs/foundation/curves/grumpkin");
  const signingKey = GrumpkinScalar.fromString(String(draft.signingKey));
  const id = String(pollId);
  const poll = { ...draft.poll, id };
  if (draft.hiddenAuthor || poll.hiddenAuthor) {
    delete poll.creator;
    poll.hiddenAuthor = true;
  } else {
    poll.creator = draft.creator;
  }
  const signedListing = await fieldFromUtf8(
    canonicalListing({
      contract,
      pollId: id,
      title: poll.title,
      description: poll.description,
      options: poll.options,
      topics: poll.topics,
      zk: poll.zkRequirements,
    }),
  );
  const signature = await new Schnorr().constructSignature(new Fr(BigInt(signedListing)), signingKey);
  const signatureBytes = signature.toBuffer();
  const signatureHex = [...signatureBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    poll,
    signature: signatureHex,
    signingPublicKey: { x: String(draft.publicKey.x), y: String(draft.publicKey.y) },
  };
}
