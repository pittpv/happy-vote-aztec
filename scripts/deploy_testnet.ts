/**
 * Deploy HappyVote + polls to Aztec Testnet 6.0.0.
 *
 * Usage (WSL):
 *   cd aztec
 *   AZTEC_ENV=testnet npx tsx scripts/deploy_testnet.ts
 *
 * Reuses SECRET_KEY / SIGNING_KEY / SALT from .env when set.
 * Does NOT treat a fast send() return as published: waits until
 * aztec_getContract on the public RPC returns a real instance.
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { HappyVoteContract } from "../src/artifacts/HappyVote.ts";
import { Fr } from "@aztec-labs/aztec.js/fields";
import { AztecAddress } from "@aztec-labs/aztec.js/addresses";
import { loadContractArtifact } from "@aztec-labs/aztec.js/abi";
import { Contract } from "@aztec-labs/aztec.js/contracts";
import { createHappyVoteNode } from "../src/utils/aztec_node.js";
import { TxHash, TxStatus } from "@aztec-labs/stdlib/tx";
import { deriveStorageSlotInMap } from "@aztec-labs/stdlib/hash";
import { type Logger, createLogger } from "@aztec-labs/foundation/log";
import { SponsoredFeePaymentMethod } from "@aztec-labs/aztec.js/fee";
import { setupWallet } from "../src/utils/setup_wallet.js";
import { getSponsoredFPCInstance } from "../src/utils/sponsored_fpc.js";
import { SponsoredFPCContractArtifact } from "@aztec-labs/noir-contracts.js/SponsoredFPC";
import { deploySchnorrAccount } from "../src/utils/deploy_account.js";
import { getTimeouts } from "../config/config.js";

const PRIVACY_VOTER_CHOICE = 2;
const ELIGIBILITY_OPEN = 0;
const ELIGIBILITY_PERSONHOOD = 1;
const VOTE_ONCE = 0;
const VOTE_DAILY = 1;
const OPTIONS_COUNT_SLOT = 2n;
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

function sec1PrivateKey(raw: Buffer) {
  const body = Buffer.concat([
    Buffer.from([0x02, 0x01, 0x01, 0x04, 0x20]),
    raw,
    Buffer.from([0xa0, 0x07, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]),
  ]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

function limb(buf: Buffer, offset: number) {
  return BigInt(`0x${buf.subarray(offset, offset + 16).toString("hex")}`);
}

/** Public limbs for set_zk_signer. The private key is written to .env and never logged. */
function attestationKey() {
  const existing = process.env.ZKPASSPORT_ATTEST_KEY?.trim() ?? "";
  let raw: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(existing)) {
    raw = Buffer.from(existing, "hex");
  } else {
    raw = randomBytes(32);
    while (raw.every((byte) => byte === 0) || BigInt(`0x${raw.toString("hex")}`) >= SECP256K1_N) {
      raw = randomBytes(32);
    }
  }
  const privateKey = createPrivateKey({ key: sec1PrivateKey(raw), format: "der", type: "sec1" });
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  if (!jwk.x || !jwk.y) throw new Error("Attestation public key is invalid");
  const x = Buffer.from(jwk.x, "base64url");
  const y = Buffer.from(jwk.y, "base64url");
  if (x.length !== 32 || y.length !== 32) throw new Error("Attestation public key is invalid");
  return { hex: raw.toString("hex"), xHi: limb(x, 0), xLo: limb(x, 16), yHi: limb(y, 0), yLo: limb(y, 16) };
}
const PUBLIC_RPC = "https://aztec-testnet.drpc.org";
const PUBLISH_TIMEOUT_MS = 20 * 60 * 1000;
const PUBLISH_POLL_MS = 15_000;
const DEPLOY_ATTEMPTS = 3;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: resolve(root, ".env") });

function waitSeconds(rawMsOrSec: number): number {
  return rawMsOrSec > 10_000 ? Math.ceil(rawMsOrSec / 1000) : rawMsOrSec;
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (Array.isArray(value) && value.length === 1) return asBigInt(value[0]);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown> & { toBigInt?: () => bigint; asField?: () => { toBigInt?: () => bigint } };
    if ("result" in o) return asBigInt(o.result);
    if (typeof o.toBigInt === "function") return o.toBigInt();
    if (typeof (o as { toString?: () => string }).toString === "function") {
      const s = String(o);
      if (/^0x[0-9a-f]+$/i.test(s) || /^\d+$/.test(s)) return BigInt(s);
    }
  }
  throw new Error(`Cannot coerce: ${String(value)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function txHashToString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof (value as { toString?: () => string }).toString === "function") {
    const s = (value as { toString: () => string }).toString();
    if (s && s !== "[object Object]") return s;
  }
  return undefined;
}

function upsertEnvFile(filePath: string, updates: Record<string, string>) {
  let text = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.length ? text.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
      out.push(`${m[1]}=${updates[m[1]]}`);
      seen.add(m[1]);
    } else {
      out.push(line);
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      out.push(`${key}=${value}`);
    }
  }
  writeFileSync(filePath, `${out.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

async function waitUntilPublished(
  addressStr: string,
  txHashStr: string | undefined,
  logger: Logger,
): Promise<NonNullable<Awaited<ReturnType<ReturnType<typeof createHappyVoteNode>["getContract"]>>>> {
  const node = createHappyVoteNode(PUBLIC_RPC);
  const address = AztecAddress.fromStringUnsafe(addressStr);
  const started = Date.now();
  let lastTxStatus = "unknown";

  while (Date.now() - started < PUBLISH_TIMEOUT_MS) {
    const elapsed = Math.round((Date.now() - started) / 1000);
    if (txHashStr) {
      const receipt = await node.getTxReceipt(TxHash.fromString(txHashStr));
      lastTxStatus = String(receipt?.status ?? "missing");
      const errorText =
        receipt && typeof receipt === "object" && "error" in receipt
          ? String((receipt as { error?: unknown }).error ?? "")
          : "";
      logger.info(`tx ${txHashStr} status=${lastTxStatus}${errorText ? ` error=${errorText}` : ""} (${elapsed}s)`);
      if (lastTxStatus.toLowerCase() === TxStatus.DROPPED && elapsed > 180) {
        throw new Error(
          `Deploy tx dropped by node after ${elapsed}s: ${txHashStr}${errorText ? ` (${errorText})` : ""}`,
        );
      }
    }

    const instance = await node.getContract(address);
    if (instance) {
      const classId = String(
        instance.currentContractClassId ?? instance.originalContractClassId ?? "unknown",
      );
      logger.info(`Public RPC published ${addressStr} class=${classId}`);
      return instance;
    }

    logger.info(`Waiting for aztec_getContract (${elapsed}s, last tx status=${lastTxStatus})…`);
    await sleep(PUBLISH_POLL_MS);
  }

  throw new Error(
    `Contract ${addressStr} not visible on ${PUBLIC_RPC} after ${PUBLISH_TIMEOUT_MS}ms (last tx status=${lastTxStatus})`,
  );
}

async function pollOptionCount(addressStr: string, pollIdNum: number): Promise<bigint> {
  const node = createHappyVoteNode(PUBLIC_RPC);
  const address = AztecAddress.fromStringUnsafe(addressStr);
  const pollKey = { toField: () => Fr.fromString(String(pollIdNum)) };
  const slot = await deriveStorageSlotInMap(new Fr(OPTIONS_COUNT_SLOT), pollKey);
  const raw = await node.getPublicStorageAt("latest", address, slot);
  if (raw == null) return 0n;
  return asBigInt(raw);
}

async function waitUntilPollExists(
  addressStr: string,
  pollIdNum: number,
  minOptions: bigint,
  logger: Logger,
) {
  const started = Date.now();
  while (Date.now() - started < PUBLISH_TIMEOUT_MS) {
    const value = await pollOptionCount(addressStr, pollIdNum);
    const elapsed = Math.round((Date.now() - started) / 1000);
    if (value >= minOptions) {
      logger.info(`Poll #${pollIdNum} visible on public RPC (options=${value})`);
      return;
    }
    logger.info(`Waiting for poll #${pollIdNum} on public RPC (${elapsed}s, options=${value})…`);
    await sleep(PUBLISH_POLL_MS);
  }
  throw new Error(`Poll #${pollIdNum} not visible on public RPC after ${PUBLISH_TIMEOUT_MS}ms`);
}

async function main() {
  if ((process.env.AZTEC_ENV || "") !== "testnet") {
    throw new Error("Set AZTEC_ENV=testnet before running this script");
  }

  const logger: Logger = createLogger("aztec:happy-vote:testnet");
  const timeouts = getTimeouts();
  const txWait = {
    timeout: waitSeconds(timeouts.txTimeout),
    interval: 8,
    ignoreDroppedReceiptsFor: 180,
    waitForStatus: TxStatus.PROPOSED,
  };
  const deployWait = {
    timeout: waitSeconds(timeouts.deployTimeout),
    interval: 8,
    ignoreDroppedReceiptsFor: 180,
    waitForStatus: TxStatus.PROPOSED,
  };

  logger.info("Setting up wallet (prover enabled on testnet)…");
  const wallet = await setupWallet();
  const sponsoredFPC = await getSponsoredFPCInstance();
  await wallet.registerContract(sponsoredFPC, SponsoredFPCContractArtifact);
  const fee = { paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address) };
  logger.info(`SponsoredFPC: ${sponsoredFPC.address}`);

  logger.info("Deploying admin account…");
  const admin = await deploySchnorrAccount(wallet);
  logger.info(`Admin: ${admin.address}`);

  const resumeAddress = process.env.RESUME_HAPPY_VOTE_ADDRESS?.trim();
  let contract: Awaited<ReturnType<typeof HappyVoteContract.at>> | undefined;
  let lastError: unknown;
  if (resumeAddress) {
    logger.info(`Resuming published HappyVote ${resumeAddress}`);
    const address = AztecAddress.fromStringUnsafe(resumeAddress);
    const node = createHappyVoteNode(PUBLIC_RPC);
    const instance = await node.getContract(address);
    if (!instance) {
      throw new Error(`Contract not found on node: ${resumeAddress}`);
    }
    await wallet.registerContract(instance, HappyVoteContract.artifact);
    contract = await HappyVoteContract.at(address, wallet);
  }
  for (let attempt = 1; !contract && attempt <= DEPLOY_ATTEMPTS; attempt++) {
    logger.info(
      `Deploying HappyVote attempt ${attempt}/${DEPLOY_ATTEMPTS} (prove may take a while; publication is confirmed via public RPC)…`,
    );
    try {
      const deployRequest = HappyVoteContract.deploy(wallet, admin.address);
      await deployRequest.simulate({ from: admin.address });
      const sent = await deployRequest.send({
        from: admin.address,
        fee,
        wait: deployWait,
      });
      contract = sent.contract;
      const txHash = txHashToString(sent.receipt?.txHash) ?? txHashToString(sent.receipt);
      logger.info(
        `Send returned address ${contract.address} tx=${txHash ?? "unknown"} receiptStatus=${sent.receipt?.status ?? "unknown"} — confirming on public RPC`,
      );
      await waitUntilPublished(contract.address.toString(), txHash, logger);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      logger.info(`Deploy attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
      if (contract) {
        logger.info("Send already returned an address — retrying public RPC wait, not a new deploy");
        await waitUntilPublished(contract.address.toString(), undefined, logger);
        lastError = undefined;
        break;
      }
      if (attempt === DEPLOY_ATTEMPTS) throw error;
    }
  }
  if (!contract) {
    throw lastError instanceof Error ? lastError : new Error("HappyVote deploy did not publish on public RPC");
  }

  const addressStr = contract.address.toString();
  const polls: Array<{
    id: string;
    options: number;
    label: string;
    args: Parameters<typeof contract.methods.create_poll>;
  }> = [
    {
      id: "1",
      options: 2,
      label: "Happy/Sad poll (voter_choice, daily)",
      args: [{ id: Fr.fromString(process.env.POLL_ID ?? "1") }, 2, PRIVACY_VOTER_CHOICE, ELIGIBILITY_OPEN, new Fr(1), false, 0, 0, VOTE_DAILY],
    },
    {
      id: "2",
      options: 3,
      label: "Iteration 3 roadmap poll #2 (3 options, open eligibility)",
      args: [{ id: Fr.fromString("2") }, 3, PRIVACY_VOTER_CHOICE, ELIGIBILITY_OPEN, new Fr(2), false, 0, 0, VOTE_ONCE],
    },
    {
      id: "3",
      options: 2,
      label: "poll #3 (ZKPassport personhood)",
      args: [{ id: Fr.fromString("3") }, 2, PRIVACY_VOTER_CHOICE, ELIGIBILITY_PERSONHOOD, new Fr(3), false, 0, 0, VOTE_ONCE],
    },
    {
      id: "4",
      options: 3,
      label: "poll #4 (sealed tallies, 3 options)",
      args: [{ id: Fr.fromString("4") }, 3, PRIVACY_VOTER_CHOICE, ELIGIBILITY_OPEN, new Fr(4), true, 0, 0, VOTE_ONCE],
    },
  ];
  for (const poll of polls) {
    const existing = await pollOptionCount(addressStr, Number(poll.id));
    if (existing >= BigInt(poll.options)) {
      logger.info(`Poll #${poll.id} already on chain (options=${existing})`);
      continue;
    }
    if (existing !== 0n) {
      throw new Error(`Poll #${poll.id} has ${existing} options; expected 0 or at least ${poll.options}`);
    }
    logger.info(`Creating ${poll.label}…`);
    await contract.methods.create_poll(...poll.args).send({ from: admin.address, fee, wait: txWait });
    await waitUntilPollExists(addressStr, Number(poll.id), BigInt(poll.options), logger);
  }

  if (typeof contract.methods.set_hidden_author_book !== "function") {
    throw new Error("HappyVote artifact has no set_hidden_author_book. Codegen the contract that was tested.");
  }
  const bookArtifactPath = resolve(root, "hidden_author_book/target/hidden_author_book-HiddenAuthorBook.json");
  if (!existsSync(bookArtifactPath)) {
    throw new Error(`HiddenAuthorBook artifact missing: ${bookArtifactPath}`);
  }
  const bookArtifact = loadContractArtifact(JSON.parse(readFileSync(bookArtifactPath, "utf8")));
  logger.info("Deploying HiddenAuthorBook…");
  const bookDeploy = Contract.deploy(wallet, bookArtifact, [contract.address]);
  await bookDeploy.simulate({ from: admin.address });
  const bookSent = await bookDeploy.send({ from: admin.address, fee, wait: deployWait });
  const bookContract = bookSent.contract;
  const bookTx = txHashToString(bookSent.receipt?.txHash) ?? txHashToString(bookSent.receipt);
  logger.info(
    `HiddenAuthorBook send returned ${bookContract.address} tx=${bookTx ?? "unknown"} — confirming on public RPC`,
  );
  await waitUntilPublished(bookContract.address.toString(), bookTx, logger);
  logger.info("Pointing HappyVote at HiddenAuthorBook…");
  await contract.methods.set_hidden_author_book(bookContract.address).send({
    from: admin.address,
    fee,
    wait: txWait,
  });

  if (typeof contract.methods.set_sealed_tally_book !== "function") {
    throw new Error("HappyVote artifact has no set_sealed_tally_book. Codegen the contract that was tested.");
  }
  const sealedArtifactPath = resolve(root, "sealed_tally_book/target/sealed_tally_book-SealedTallyBook.json");
  if (!existsSync(sealedArtifactPath)) {
    throw new Error(`SealedTallyBook artifact missing: ${sealedArtifactPath}`);
  }
  const sealedArtifact = loadContractArtifact(JSON.parse(readFileSync(sealedArtifactPath, "utf8")));
  logger.info("Deploying SealedTallyBook…");
  const sealedDeploy = Contract.deploy(wallet, sealedArtifact, [contract.address]);
  await sealedDeploy.simulate({ from: admin.address });
  const sealedSent = await sealedDeploy.send({ from: admin.address, fee, wait: deployWait });
  const sealedContract = sealedSent.contract;
  const sealedTx = txHashToString(sealedSent.receipt?.txHash) ?? txHashToString(sealedSent.receipt);
  logger.info(
    `SealedTallyBook send returned ${sealedContract.address} tx=${sealedTx ?? "unknown"} — confirming on public RPC`,
  );
  await waitUntilPublished(sealedContract.address.toString(), sealedTx, logger);
  logger.info("Pointing HappyVote at SealedTallyBook…");
  await contract.methods.set_sealed_tally_book(sealedContract.address).send({
    from: admin.address,
    fee,
    wait: txWait,
  });
  const signer = attestationKey();
  logger.info("Setting the ZK attestation signer…");
  await contract.methods.set_zk_signer(signer.xHi, signer.xLo, signer.yHi, signer.yLo).send({
    from: admin.address,
    fee,
    wait: txWait,
  });

  const bookAddressStr = bookContract.address.toString();
  const sealedAddressStr = sealedContract.address.toString();
  upsertEnvFile(resolve(root, ".env"), {
    AZTEC_ENV: "testnet",
    NODE_URL: PUBLIC_RPC,
    SPONSORED_FPC_ADDRESS: sponsoredFPC.address.toString(),
    HAPPY_VOTE_CONTRACT_ADDRESS: addressStr,
    HIDDEN_AUTHOR_BOOK_ADDRESS: bookAddressStr,
    SEALED_TALLY_BOOK_ADDRESS: sealedAddressStr,
    ZKPASSPORT_ATTEST_KEY: signer.hex,
    POLL_ID: "1",
  });
  upsertEnvFile(resolve(root, "web/.env.local"), {
    VITE_AZTEC_NODE_URL: PUBLIC_RPC,
    VITE_HAPPY_VOTE_CONTRACT_ADDRESS: addressStr,
    VITE_HIDDEN_AUTHOR_BOOK_ADDRESS: bookAddressStr,
    VITE_SEALED_TALLY_BOOK_ADDRESS: sealedAddressStr,
    VITE_SPONSORED_FPC_ADDRESS: sponsoredFPC.address.toString(),
    VITE_DEFAULT_POLL_ID: "1",
  });
  logger.info("Updated aztec/.env and web/.env.local contract address (other keys preserved).");
  logger.info(`TESTNET DEPLOY OK ${addressStr}`);
  logger.info(`HIDDEN_AUTHOR_BOOK ${bookAddressStr}`);
  logger.info(`SEALED_TALLY_BOOK ${sealedAddressStr}`);
}

main().catch((error) => {
  console.error("TESTNET DEPLOY FAILED", error);
  process.exit(1);
});
