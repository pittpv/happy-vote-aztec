/**
 * Reduce digest bytes into an Aztec field (SHA-256 may exceed BN254 modulus).
 *
 * `Fr.fromBufferReduce` expects a Node Buffer and does `buf.toString("hex")`.
 * `crypto.subtle.digest` returns a Uint8Array; `Uint8Array#toString` ignores
 * the encoding and yields `"41,40,187,..."`, which BigInt cannot parse.
 *
 * @param {Uint8Array|ArrayBuffer|Buffer} digest
 * @param {typeof import("@aztec/aztec.js/fields").Fr} Fr
 */
export function fieldFromDigest(digest, Fr) {
  if (!Fr) throw new Error("Fr constructor is required");
  const bytes = toDigestBytes(digest);

  const NodeBuffer = globalThis.Buffer;
  if (typeof Fr.fromBufferReduce === "function" && typeof NodeBuffer?.from === "function") {
    return Fr.fromBufferReduce(NodeBuffer.from(bytes));
  }

  if (typeof Fr.MODULUS !== "bigint") {
    throw new Error("Fr.MODULUS is required");
  }
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return new Fr(BigInt(`0x${hex}`) % Fr.MODULUS);
}

function toDigestBytes(digest) {
  if (digest instanceof Uint8Array) {
    if (digest.byteLength === 0) throw new Error("digest is empty");
    return digest;
  }
  if (digest instanceof ArrayBuffer) {
    if (digest.byteLength === 0) throw new Error("digest is empty");
    return new Uint8Array(digest);
  }
  throw new Error("digest must be bytes");
}
