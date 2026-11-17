import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERATOR,
  encryptBit,
  mul,
  tallyFromCiphertext,
} from "./grumpkin.js";

test("one sealed ballot decrypts to a one-hot tally", () => {
  const sk = 7n;
  const pk = mul(GENERATOR, sk);
  const options = 2;
  const choice = 0;
  let points = Array.from({ length: options * 4 }, () => 0n);
  for (let i = 0; i < options; i += 1) {
    const [c1, c2] = encryptBit(i === choice ? 1n : 0n, BigInt(i + 3), pk);
    points[i * 4] = c1.x;
    points[i * 4 + 1] = c1.y;
    points[i * 4 + 2] = c2.x;
    points[i * 4 + 3] = c2.y;
  }
  assert.deepEqual(tallyFromCiphertext(points, sk, options), [1n, 0n]);
});
