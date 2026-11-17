/**
 * Sealed-tally keys.
 * Three shares are time-locked to the drand round for publishAt.
 * The process does not keep the shares after the ciphertexts are written.
 */
import { createHash, createPrivateKey, randomBytes, sign } from "node:crypto";
import { mainnetClient, roundAt, timelockDecrypt, timelockEncrypt } from "tlock-js";

import { readJson, withStoreLock, writeJson } from "./local-store.js";
import { GENERATOR, add, mul } from "../src/lib/grumpkin.js";

const STORE = "sealed-keys.json";
const DOMAIN = 0x48565f534bn;
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const FIELD_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function be32(value) {
  const buf = Buffer.alloc(32);
  let x = BigInt(value);
  if (x < 0n || x >= 1n << 256n) throw new Error("Sealed field does not fit in 32 bytes");
  for (let i = 31; i >= 0; i -= 1) {
    buf[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return buf;
}

function sec1PrivateKey(raw) {
  const body = Buffer.concat([
    Buffer.from([0x02, 0x01, 0x01, 0x04, 0x20]),
    raw,
    Buffer.from([0xa0, 0x07, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]),
  ]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

function loadRegistrar() {
  const raw = String(process.env.SEALED_REGISTRAR_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    const error = new Error("Sealed key registrar is not configured");
    error.status = 503;
    throw error;
  }
  const privateKey = createPrivateKey({
    key: sec1PrivateKey(Buffer.from(raw, "hex")),
    format: "der",
    type: "sec1",
  });
  return privateKey;
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

export function sealedKeyMessage({ pollId, pkX, pkY, blobHash, publishAt }) {
  return Buffer.concat([
    be32(pollId),
    be32(pkX),
    be32(pkY),
    be32(blobHash),
    be32(publishAt),
    be32(DOMAIN),
  ]);
}

function randomShare() {
  const buf = randomBytes(14);
  const sk = BigInt(`0x${buf.toString("hex")}`);
  if (sk === 0n) return randomShare();
  return sk;
}

async function readStore() {
  const data = await readJson(STORE);
  if (!data) return { polls: {} };
  if (!data.polls || typeof data.polls !== "object") throw new Error("sealed-keys.json must contain polls");
  return data;
}

export async function createSealedKey({ pollId, publishAt }) {
  const id = String(pollId);
  if (!/^[0-9]+$/.test(id)) throw new Error("Poll id is required");
  const when = Number(publishAt);
  if (!Number.isInteger(when) || when <= Math.floor(Date.now() / 1000)) {
    throw new Error("Publish time must be in the future");
  }
  const client = mainnetClient();
  const info = await client.chain().info();
  const round = roundAt(when * 1000, info);
  let pk = { x: 0n, y: 0n, inf: true };
  const ciphertexts = [];
  for (let i = 0; i < 3; i += 1) {
    const share = randomShare();
    pk = add(pk, mul(GENERATOR, share));
    const payload = Buffer.alloc(16);
    let limb = share;
    for (let b = 15; b >= 0; b -= 1) {
      payload[b] = Number(limb & 0xffn);
      limb >>= 8n;
    }
    ciphertexts.push(await timelockEncrypt(round, payload, client));
  }
  if (pk.inf || pk.x === 0n) throw new Error("Sealed key generation failed");
  const canonical = JSON.stringify(ciphertexts);
  const blobHash = BigInt(`0x${createHash("sha256").update(canonical).digest("hex")}`) % FIELD_P;
  const message = sealedKeyMessage({
    pollId: BigInt(id),
    pkX: pk.x,
    pkY: pk.y,
    blobHash,
    publishAt: BigInt(when),
  });
  const signature = normalizeLowS(
    sign("sha256", message, { key: loadRegistrar(), dsaEncoding: "ieee-p1363" }),
  );
  const record = {
    pollId: id,
    publishAt: when,
    round,
    pkX: pk.x.toString(),
    pkY: pk.y.toString(),
    blobHash: blobHash.toString(),
    ciphertexts,
  };
  await withStoreLock(async () => {
    const store = await readStore();
    if (store.polls[id]) {
      const error = new Error("Sealed key already registered");
      error.status = 409;
      throw error;
    }
    store.polls[id] = record;
    await writeJson(STORE, store);
  });
  return {
    pollId: id,
    publishAt: when,
    pkX: record.pkX,
    pkY: record.pkY,
    blobHash: record.blobHash,
    r: signature.subarray(0, 32).toString("hex"),
    s: signature.subarray(32).toString("hex"),
  };
}

export async function openSealedKey(pollId) {
  const id = String(pollId);
  const store = await readStore();
  const record = store.polls[id];
  if (!record) {
    const error = new Error("This poll has no sealed key");
    error.status = 404;
    throw error;
  }
  if (Math.floor(Date.now() / 1000) < Number(record.publishAt)) {
    const error = new Error("Results are not published yet");
    error.status = 409;
    throw error;
  }
  const client = mainnetClient();
  let sk = 0n;
  for (const ciphertext of record.ciphertexts) {
    const opened = await timelockDecrypt(ciphertext, client);
    sk += BigInt(`0x${Buffer.from(opened).toString("hex")}`);
  }
  if (sk === 0n) throw new Error("Sealed key did not open");
  return { pollId: id, sk: sk.toString(), pkX: record.pkX, pkY: record.pkY };
}

function readBody(req) {
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body || {};
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (req.method === "POST") {
      const body = readBody(req);
      const created = await createSealedKey({ pollId: body.pollId, publishAt: body.publishAt });
      return res.status(200).json(created);
    }
    if (req.method === "GET") {
      const pollId = new URL(req.url || "/", "http://localhost").searchParams.get("pollId");
      const opened = await openSealedKey(pollId);
      return res.status(200).json(opened);
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const status = error.status || 400;
    return res.status(status).json({ error: error.message || "Sealed key failed" });
  }
}
