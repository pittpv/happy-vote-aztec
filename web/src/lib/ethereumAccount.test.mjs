import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "buffer";
import { secp256k1 } from "@noble/curves/secp256k1";
import { addressFromPrivateKey, signMessage, flipSignature } from "@aztec-labs/foundation/crypto/secp256k1-signer";
import { Fr, Fq } from "@aztec-labs/foundation/curves/bn254";
import {
  checkedEthereumAddress,
  deriveEthereumAccountKeys,
  ethereumSignDigest,
  ethereumSignInMessage,
} from "./ethereumAccount.js";

const ORIGIN = "https://aztec.happyvote.xyz";

function signer() {
  const privateKey = Buffer.from(secp256k1.utils.randomPrivateKey());
  return {
    privateKey,
    address: addressFromPrivateKey(privateKey).toString().toLowerCase(),
  };
}

function signed(account, message) {
  return signMessage(ethereumSignDigest(message), account.privateKey).toString();
}

test("the sign-in message is frozen for this origin and address", () => {
  const address = "0x1111111111111111111111111111111111111111";
  assert.equal(
    ethereumSignInMessage({ origin: ORIGIN, address }),
    [
      "Create or open your private HappyVote account.",
      "",
      "Only sign this request on https://aztec.happyvote.xyz.",
      "This signature is your account key. Do not share it.",
      "",
      "Ethereum account: 0x1111111111111111111111111111111111111111",
      "HappyVote account version: 1",
    ].join("\n"),
  );
  assert.throws(() => checkedEthereumAddress("0x0000000000000000000000000000000000000000"));
  assert.throws(() => ethereumSignInMessage({ origin: "https://evil.example/phish", address }));
});

test("the same signature always derives the same Aztec account keys", async () => {
  const account = signer();
  const message = ethereumSignInMessage({ origin: ORIGIN, address: account.address });
  const signature = signed(account, message);
  const first = await deriveEthereumAccountKeys({ message, signature, address: account.address });
  const second = await deriveEthereumAccountKeys({ message, signature, address: account.address });
  assert.deepEqual(second, first);
  assert.match(first.secretKey, /^0x[0-9a-f]{64}$/);
  assert.match(first.salt, /^0x[0-9a-f]{64}$/);
  assert.match(first.signingKey, /^0x[0-9a-f]{64}$/);
  assert.notEqual(first.secretKey, first.signingKey);
  assert.equal(Fr.fromString(first.secretKey).toString(), first.secretKey);
  assert.equal(Fr.fromString(first.salt).toString(), first.salt);
  assert.equal(Fq.fromString(first.signingKey).toString(), first.signingKey);
});

test("a high-s signature derives the same keys, and a different origin does not", async () => {
  const account = signer();
  const message = ethereumSignInMessage({ origin: ORIGIN, address: account.address });
  const digest = ethereumSignDigest(message);
  const low = signMessage(digest, account.privateKey);
  const high = flipSignature(low);
  assert.notEqual(high.toString(), low.toString());
  const fromLow = await deriveEthereumAccountKeys({
    message,
    signature: low.toString(),
    address: account.address,
  });
  const fromHigh = await deriveEthereumAccountKeys({
    message,
    signature: high.toString(),
    address: account.address,
  });
  assert.deepEqual(fromHigh, fromLow);

  const other = ethereumSignInMessage({ origin: "http://localhost:5173", address: account.address });
  const otherKeys = await deriveEthereumAccountKeys({
    message: other,
    signature: signed(account, other),
    address: account.address,
  });
  assert.notEqual(otherKeys.secretKey, fromLow.secretKey);
});

test("a signature from another account is rejected without echoing the signature", async () => {
  const account = signer();
  const other = signer();
  const message = ethereumSignInMessage({ origin: ORIGIN, address: account.address });
  await assert.rejects(
    deriveEthereumAccountKeys({
      message,
      signature: signed(other, message),
      address: account.address,
    }),
    (error) => {
      assert.equal(
        error.message,
        "The signature does not match the selected Ethereum account. A contract wallet cannot open this account.",
      );
      assert.equal(error.message.includes("0x"), false);
      return true;
    },
  );
});
