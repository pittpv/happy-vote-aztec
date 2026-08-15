/**
 * Deploy HappyVote + polls to Aztec Testnet 5.1.0.
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
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { HappyVoteContract } from "../src/artifacts/HappyVote.js";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TxHash, TxStatus } from "@aztec/stdlib/tx";
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash";
import { type Logger, createLogger } from "@aztec/foundation/log";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { setupWallet } from "../src/utils/setup_wallet.js";
import { getSponsoredFPCInstance } from "../src/utils/sponsored_fpc.js";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";
import { deploySchnorrAccount } from "../src/utils/deploy_account.js";
import { getTimeouts } from "../config/config.js";

const PRIVACY_VOTER_CHOICE = 2;
const ELIGIBILITY_OPEN = 0;
const ELIGIBILITY_PERSONHOOD = 1;
const VOTE_ONCE = 0;
const VOTE_DAILY = 1;
const OPTIONS_COUNT_SLOT = 2n;
const PUBLIC_RPC = "https://v5.testnet.rpc.aztec-labs.com";
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
): Promise<NonNullable<Awaited<ReturnType<ReturnType<typeof createAztecNodeClient>["getContract"]>>>> {
  const node = createAztecNodeClient(PUBLIC_RPC);
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

async function waitUntilPollExists(
  addressStr: string,
  pollIdNum: number,
  minOptions: bigint,
  logger: Logger,
) {
  const node = createAztecNodeClient(PUBLIC_RPC);
  const address = AztecAddress.fromStringUnsafe(addressStr);
  const pollKey = { toField: () => Fr.fromString(String(pollIdNum)) };
  const slot = await deriveStorageSlotInMap(new Fr(OPTIONS_COUNT_SLOT), pollKey);
  const started = Date.now();
  while (Date.now() - started < PUBLISH_TIMEOUT_MS) {
    const raw = await node.getPublicStorageAt("latest", address, slot);
    let value = 0n;
    try {
      value = asBigInt(raw);
    } catch {
      value = 0n;
    }
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

  let contract: Awaited<ReturnType<typeof HappyVoteContract.at>> | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= DEPLOY_ATTEMPTS; attempt++) {
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

  const pollId = { id: Fr.fromString(process.env.POLL_ID ?? "1") };
  logger.info("Creating Happy/Sad poll (voter_choice, daily)…");
  await contract.methods
    .create_poll(pollId, 2, PRIVACY_VOTER_CHOICE, ELIGIBILITY_OPEN, new Fr(1), false, 0, 0, VOTE_DAILY)
    .send({ from: admin.address, fee, wait: txWait });
  await waitUntilPollExists(contract.address.toString(), 1, 2n, logger);

  const poll2 = { id: Fr.fromString("2") };
  logger.info("Creating single-choice poll #2 (3 options, open eligibility)…");
  await contract.methods
    .create_poll(poll2, 3, PRIVACY_VOTER_CHOICE, ELIGIBILITY_OPEN, new Fr(2), false, 0, 0, VOTE_ONCE)
    .send({ from: admin.address, fee, wait: txWait });
  await waitUntilPollExists(contract.address.toString(), 2, 3n, logger);

  const poll3 = { id: Fr.fromString("3") };
  logger.info("Creating poll #3 (ZKPassport personhood)…");
  await contract.methods
    .create_poll(poll3, 2, PRIVACY_VOTER_CHOICE, ELIGIBILITY_PERSONHOOD, new Fr(3), false, 0, 0, VOTE_ONCE)
    .send({ from: admin.address, fee, wait: txWait });
  await waitUntilPollExists(contract.address.toString(), 3, 2n, logger);

  const addressStr = contract.address.toString();
  upsertEnvFile(resolve(root, ".env"), {
    AZTEC_ENV: "testnet",
    NODE_URL: PUBLIC_RPC,
    SPONSORED_FPC_ADDRESS: sponsoredFPC.address.toString(),
    HAPPY_VOTE_CONTRACT_ADDRESS: addressStr,
    POLL_ID: "1",
  });
  upsertEnvFile(resolve(root, "web/.env.local"), {
    VITE_AZTEC_NODE_URL: PUBLIC_RPC,
    VITE_HAPPY_VOTE_CONTRACT_ADDRESS: addressStr,
    VITE_SPONSORED_FPC_ADDRESS: sponsoredFPC.address.toString(),
    VITE_DEFAULT_POLL_ID: "1",
  });
  logger.info("Updated aztec/.env and web/.env.local contract address (other keys preserved).");

  const publicDoc = `# Testnet addresses — HappyVote on Aztec

Network: **Aztec Testnet 5.1.0**  
RPC: \`https://v5.testnet.rpc.aztec-labs.com\`  
Explorer: https://testnet.aztecscan.xyz  
Deployed: ${new Date().toISOString()}

| Item | Value |
|------|-------|
| HappyVote | [\`${addressStr}\`](https://testnet.aztecscan.xyz/address/${addressStr}) |
| Sponsored FPC | \`${sponsoredFPC.address}\` |
| Poll id | \`1\` Happy/Sad (daily) · \`2\` single-choice (3 opts) · \`3\` ZKPassport personhood test · \`voter_choice\` |
| Eligibility modes | \`0\` open · \`1\` ZKPassport personhood · \`2\` gated |

## Frontend env

\`\`\`
VITE_AZTEC_NODE_URL=https://v5.testnet.rpc.aztec-labs.com
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=${addressStr}
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=${sponsoredFPC.address}
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
\`\`\`

Account keys stay in gitignored \`.env\`, not in this file.
`;
  writeFileSync(resolve(root, "../docs/aztec/en/10-TESTNET-ADDRESSES.md"), publicDoc, "utf8");
  logger.info("Wrote docs/aztec/en/10-TESTNET-ADDRESSES.md");
  logger.info(`TESTNET DEPLOY OK ${addressStr}`);
}

main().catch((error) => {
  console.error("TESTNET DEPLOY FAILED", error);
  process.exit(1);
});
