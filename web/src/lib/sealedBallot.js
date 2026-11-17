import { asFieldBigInt } from "./aztecClient.js";

function randomLimb() {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  return value === 0n ? 1n : value;
}

/** Eight scalars. Active options get nonzero randomness; the rest stay zero. */
export function sealedRandomness(options) {
  const out = Array.from({ length: 8 }, () => 0n);
  const count = Number(options);
  if (!Number.isInteger(count) || count < 2 || count > 8) {
    throw new Error("A sealed poll has 2 to 8 options");
  }
  for (let i = 0; i < count; i += 1) out[i] = randomLimb();
  return out;
}

export function fieldList(value) {
  const raw = value && typeof value === "object" && "result" in value ? value.result : value;
  if (!Array.isArray(raw)) throw new Error("Expected a sealed ciphertext");
  return raw.map((item) => asFieldBigInt(item));
}

export async function requestSealedKey({ pollId, publishAt }) {
  const response = await fetch("/api/sealed-key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pollId: String(pollId), publishAt }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Sealed key was not created");
  return body;
}

export async function openSealedKey(pollId) {
  const response = await fetch(`/api/sealed-key?pollId=${encodeURIComponent(String(pollId))}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Sealed key is not open");
  return body;
}
