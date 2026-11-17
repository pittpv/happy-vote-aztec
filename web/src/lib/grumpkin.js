/**
 * Grumpkin arithmetic for sealed tallies.
 * The base field is the Noir field. The generator matches std::embedded_curve_ops.
 */

const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const ORDER = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
export const GENERATOR = {
  x: 1n,
  y: 17631683881184975370165255887551781615748388533673675138860n,
  inf: false,
};

function mod(value) {
  const out = value % P;
  return out >= 0n ? out : out + P;
}

export function infinity() {
  return { x: 0n, y: 0n, inf: true };
}

export function isInfinity(point) {
  return point.inf || (point.x === 0n && point.y === 0n);
}

function eq(left, right) {
  if (isInfinity(left) || isInfinity(right)) return isInfinity(left) && isInfinity(right);
  return left.x === right.x && left.y === right.y;
}

function negate(point) {
  if (isInfinity(point)) return infinity();
  return { x: point.x, y: mod(-point.y), inf: false };
}

export function add(left, right) {
  if (isInfinity(left)) return right;
  if (isInfinity(right)) return left;
  if (left.x === right.x) {
    if (left.y !== right.y || left.y === 0n) return infinity();
    const slope = mod(3n * left.x * left.x * modInverse(2n * left.y));
    const x = mod(slope * slope - 2n * left.x);
    return { x, y: mod(slope * (left.x - x) - left.y), inf: false };
  }
  const slope = mod((right.y - left.y) * modInverse(right.x - left.x));
  const x = mod(slope * slope - left.x - right.x);
  return { x, y: mod(slope * (left.x - x) - left.y), inf: false };
}

function modInverse(value) {
  let t = 0n;
  let newT = 1n;
  let r = P;
  let newR = mod(value);
  while (newR !== 0n) {
    const q = r / newR;
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }
  if (r !== 1n) throw new Error("Grumpkin inverse does not exist");
  return mod(t);
}

export function mul(point, scalar) {
  let k = scalar % ORDER;
  if (k < 0n) k += ORDER;
  let result = infinity();
  let base = point;
  while (k > 0n) {
    if (k & 1n) result = add(result, base);
    base = add(base, base);
    k >>= 1n;
  }
  return result;
}

export function encryptBit(bit, randomness, pk) {
  if (randomness === 0n) throw new Error("Ballot randomness required");
  const c1 = mul(GENERATOR, randomness);
  const c2 = add(mul(pk, randomness), mul(GENERATOR, bit));
  return [c1, c2];
}

export function decryptPoint(c1, c2, sk) {
  return add(c2, mul(negate(c1), sk));
}

/** Baby-step giant-step. `limit` is the largest tally one option can hold. */
export function discreteLog(point, limit = 1_000_000n) {
  if (isInfinity(point)) return 0n;
  const step = 1024n;
  const table = new Map();
  let baby = infinity();
  for (let i = 0n; i < step; i += 1n) {
    table.set(`${baby.x}:${baby.y}:${baby.inf ? 1 : 0}`, i);
    baby = add(baby, GENERATOR);
  }
  const giant = mul(GENERATOR, step);
  let acc = point;
  const jumps = limit / step + 1n;
  for (let j = 0n; j <= jumps; j += 1n) {
    const hit = table.get(`${acc.x}:${acc.y}:${acc.inf ? 1 : 0}`);
    if (hit != null) {
      const count = j * step + hit;
      if (count <= limit) return count;
    }
    acc = add(acc, negate(giant));
  }
  throw new Error("Sealed tally is outside the decryption bound");
}

export function tallyFromCiphertext(points, sk, options) {
  const counts = [];
  for (let i = 0; i < options; i += 1) {
    const base = i * 4;
    const c1 = { x: points[base], y: points[base + 1], inf: points[base] === 0n && points[base + 1] === 0n };
    const c2 = { x: points[base + 2], y: points[base + 3], inf: points[base + 2] === 0n && points[base + 3] === 0n };
    counts.push(discreteLog(decryptPoint(c1, c2, sk)));
  }
  return counts;
}

export function pointsEqual(left, right) {
  return eq(left, right);
}
