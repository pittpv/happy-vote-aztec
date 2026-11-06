import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { Fr } from "@aztec-labs/aztec.js/fields";
import { identityCommitmentFromUid } from "../src/lib/zkIdentity.js";

const DOMAIN = 0x48565f5a4bn;
const WINDOW_SECONDS = 900;
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

function be32(value) {
  const buf = Buffer.alloc(32);
  let x = BigInt(value);
  for (let i = 31; i >= 0; i -= 1) {
    buf[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  if (x !== 0n) throw new Error("Attestation field does not fit in 32 bytes");
  return buf;
}

function sec1PrivateKey(raw) {
  const key = Buffer.from(raw);
  if (key.length !== 32) throw new Error("Attestation key must be 32 bytes");
  const body = Buffer.concat([
    Buffer.from([0x02, 0x01, 0x01, 0x04, 0x20]),
    key,
    Buffer.from([0xa0, 0x07, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]),
  ]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

function loadKey() {
  const raw = String(process.env.ZKPASSPORT_ATTEST_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    const error = new Error("Identity attestation is not configured");
    error.status = 503;
    throw error;
  }
  const privateKey = createPrivateKey({
    key: sec1PrivateKey(Buffer.from(raw, "hex")),
    format: "der",
    type: "sec1",
  });
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  const x = Buffer.from(jwk.x, "base64url");
  const y = Buffer.from(jwk.y, "base64url");
  if (x.length !== 32 || y.length !== 32) throw new Error("Attestation public key is invalid");
  return { privateKey, x, y };
}

function limb(buf, offset) {
  return BigInt(`0x${buf.subarray(offset, offset + 16).toString("hex")}`).toString();
}

function normalizeLowS(signature) {
  const r = signature.subarray(0, 32);
  let s = BigInt(`0x${signature.subarray(32).toString("hex")}`);
  if (s > SECP256K1_N / 2n) s = SECP256K1_N - s;
  const sBuf = Buffer.alloc(32);
  for (let i = 31; i >= 0; i -= 1) {
    sBuf[i] = Number(s & 0xffn);
    s >>= 8n;
  }
  return Buffer.concat([r, sBuf]);
}

/**
 * Sign the identity the contract will check. The private key never leaves this process.
 * @param {{ pollId: string, uniqueIdentifier: string, voteFrequency: number }} input
 */
export async function attestZkIdentity(input) {
  const { privateKey, x, y } = loadKey();
  const identity = await identityCommitmentFromUid(input.uniqueIdentifier, Fr);
  const identityField = BigInt(identity.toString());
  const period = Number(input.voteFrequency) === 1 ? Math.floor(Date.now() / 1000 / 86400) : 0;
  const expiry = Math.floor(Date.now() / 1000) + WINDOW_SECONDS;
  const message = Buffer.concat([
    be32(input.pollId),
    be32(identityField),
    be32(period),
    be32(expiry),
    be32(DOMAIN),
  ]);
  const signature = normalizeLowS(sign("sha256", message, { key: privateKey, dsaEncoding: "ieee-p1363" }));
  if (signature.length !== 64) throw new Error("Attestation signature is invalid");
  return {
    identity: identityField.toString(),
    period: String(period),
    expiry,
    r: signature.subarray(0, 32).toString("hex"),
    s: signature.subarray(32).toString("hex"),
    xHi: limb(x, 0),
    xLo: limb(x, 16),
    yHi: limb(y, 0),
    yLo: limb(y, 16),
  };
}
