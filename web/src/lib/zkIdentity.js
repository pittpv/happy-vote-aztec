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
