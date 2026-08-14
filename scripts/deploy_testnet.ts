/**
 * Deploy HappyVote + Happy/Sad poll to Aztec Testnet 5.1.0.
 *
 * Usage (WSL):
 *   cd aztec
 *   AZTEC_ENV=testnet npx tsx scripts/deploy_testnet.ts
 *
 * Reuses SECRET_KEY / SIGNING_KEY / SALT from .env when set.
 * Writes public addresses to docs/aztec/10-TESTNET-ADDRESSES.md
 * and secrets to aztec/.env (gitignored).
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { HappyVoteContract } from "../src/artifacts/HappyVote.js";
import { Fr } from "@aztec/aztec.js/fields";
import { type Logger, createLogger } from "@aztec/foundation/log";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { setupWallet } from "../src/utils/setup_wallet.js";
import { getSponsoredFPCInstance } from "../src/utils/sponsored_fpc.js";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";
import { deploySchnorrAccount } from "../src/utils/deploy_account.js";
import { getTimeouts } from "../config/config.js";

const PRIVACY_VOTER_CHOICE = 2;
const ELIGIBILITY_OPEN = 0;

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
    const o = value as Record<string, unknown> & { toBigInt?: () => bigint; asBigInt?: bigint };
    if ("result" in o && typeof o.asBigInt !== "bigint") return asBigInt(o.result);
    if (typeof o.asBigInt === "bigint") return o.asBigInt;
    if (typeof o.toBigInt === "function") return o.toBigInt();
  }
  throw new Error(`Cannot coerce: ${String(value)}`);
}

async function main() {
  if ((process.env.AZTEC_ENV || "") !== "testnet") {
    throw new Error("Set AZTEC_ENV=testnet before running this script");
  }

  const logger: Logger = createLogger("aztec:happy-vote:testnet");
  const timeouts = getTimeouts();
  const txWait = { timeout: waitSeconds(timeouts.txTimeout) };
  const deployWait = { timeout: waitSeconds(timeouts.deployTimeout) };

  logger.info("Setting up wallet (prover enabled on testnet)…");
  const wallet = await setupWallet();
  const sponsoredFPC = await getSponsoredFPCInstance();
  await wallet.registerContract(sponsoredFPC, SponsoredFPCContractArtifact);
  const fee = { paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address) };
  logger.info(`SponsoredFPC: ${sponsoredFPC.address}`);

  logger.info("Deploying admin account…");
  const admin = await deploySchnorrAccount(wallet);
  logger.info(`Admin: ${admin.address}`);

  logger.info("Deploying HappyVote (first prove may download keys and take a long time)…");
  const deployRequest = HappyVoteContract.deploy(wallet, admin.address);
  await deployRequest.simulate({ from: admin.address });
  const { contract } = await deployRequest.send({
    from: admin.address,
    fee,
    wait: deployWait,
  });
  logger.info(`Contract: ${contract.address}`);

  const pollId = { id: Fr.fromString(process.env.POLL_ID ?? "1") };
  logger.info("Creating Happy/Sad poll (voter_choice)…");
  await contract.methods
    .create_poll(pollId, 2, PRIVACY_VOTER_CHOICE, ELIGIBILITY_OPEN, new Fr(1), false, 0, 0)
    .send({ from: admin.address, fee, wait: txWait });

  const options = asBigInt(
    await contract.methods.get_options_count(pollId).simulate({ from: admin.address }),
  );
  if (options !== 2n) throw new Error(`Expected 2 options, got ${options}`);

  const poll2 = { id: Fr.fromString("2") };
  logger.info("Creating single-choice poll #2 (3 options, open eligibility)…");
  await contract.methods
    .create_poll(poll2, 3, PRIVACY_VOTER_CHOICE, ELIGIBILITY_OPEN, new Fr(2), false, 0, 0)
    .send({ from: admin.address, fee, wait: txWait });

  const envBody = [
    "AZTEC_ENV=testnet",
    "NODE_URL=https://v5.testnet.rpc.aztec-labs.com",
    `SPONSORED_FPC_ADDRESS=${sponsoredFPC.address}`,
    `HAPPY_VOTE_CONTRACT_ADDRESS=${contract.address}`,
    "POLL_ID=1",
    "# Admin keys — do not commit",
    `SECRET_KEY=${process.env.SECRET_KEY ?? ""}`,
    `SIGNING_KEY=${process.env.SIGNING_KEY ?? ""}`,
    `SALT=${process.env.SALT ?? ""}`,
    "",
  ].join("\n");
  writeFileSync(resolve(root, ".env"), envBody, "utf8");
  logger.info("Wrote aztec/.env (gitignored). If keys were generated this run, copy them from the logs into .env.");

  const publicDoc = `# Testnet addresses — HappyVote on Aztec

Network: **Aztec Testnet 5.1.0**  
RPC: \`https://v5.testnet.rpc.aztec-labs.com\`  
Explorer: https://testnet.aztecscan.xyz  
Deployed: ${new Date().toISOString()}

| Item | Value |
|------|-------|
| HappyVote | [\`${contract.address}\`](https://testnet.aztecscan.xyz/address/${contract.address}) |
| Sponsored FPC | \`${sponsoredFPC.address}\` |
| Poll id | \`1\` Happy/Sad · \`2\` single-choice (3 opts) · \`3\` ZKPassport personhood test · \`voter_choice\` |
| Eligibility modes | \`0\` open · \`1\` ZKPassport personhood · \`2\` gated |

## Frontend env

\`\`\`
VITE_AZTEC_NODE_URL=https://v5.testnet.rpc.aztec-labs.com
VITE_HAPPY_VOTE_CONTRACT_ADDRESS=${contract.address}
VITE_DEFAULT_POLL_ID=1
VITE_SPONSORED_FPC_ADDRESS=${sponsoredFPC.address}
VITE_PROVER_ENABLED=true
VITE_REQUIRE_ZKPASSPORT=false
\`\`\`

Account keys stay in gitignored \`.env\`, not in this file.
`;
  writeFileSync(resolve(root, "../docs/aztec/en/10-TESTNET-ADDRESSES.md"), publicDoc, "utf8");
  logger.info("Wrote docs/aztec/en/10-TESTNET-ADDRESSES.md");
  logger.info("TESTNET DEPLOY OK");
}

main().catch((error) => {
  console.error("TESTNET DEPLOY FAILED", error);
  process.exit(1);
});
