/**
 * Local smoke: deploy HappyVote, create Happy/Sad poll, cast private + open votes.
 * Requires: `aztec start --local-network`
 *
 * Usage (WSL):
 *   cd aztec && AZTEC_ENV=local-network npx tsx scripts/smoke_local.ts
 */
import "dotenv/config";
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

/** Coerce Aztec.js 5.x SimulationResult / Fr / nested decode output to bigint. */
function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      throw new Error(`Cannot coerce array of length ${value.length} to bigint`);
    }
    return asBigInt(value[0]);
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown> & {
      toBigInt?: () => bigint;
      asBigInt?: bigint;
    };
    // SimulationResult always wraps the ABI return in `.result`
    if ("result" in o && !("asBigInt" in o)) return asBigInt(o.result);
    if (typeof o.asBigInt === "bigint") return o.asBigInt;
    if (typeof o.toBigInt === "function") return o.toBigInt();
    if ("value" in o) return asBigInt(o.value);
    const keys = Object.keys(o);
    throw new Error(`Cannot coerce object keys=[${keys.join(",")}]`);
  }
  throw new Error(`Cannot coerce value to bigint: ${String(value)}`);
}

async function main() {
  const logger: Logger = createLogger("aztec:happy-vote:smoke");
  const timeouts = getTimeouts();

  logger.info("Setting up wallet…");
  const wallet = await setupWallet();
  const sponsoredFPC = await getSponsoredFPCInstance();
  await wallet.registerContract(sponsoredFPC, SponsoredFPCContractArtifact);
  const fee = { paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address) };

  logger.info("Deploying admin account…");
  const admin = await deploySchnorrAccount(wallet);
  logger.info(`Admin: ${admin.address}`);

  logger.info("Deploying voter account…");
  const voter = await deploySchnorrAccount(wallet);
  logger.info(`Voter: ${voter.address}`);

  logger.info("Deploying HappyVote…");
  const deployRequest = HappyVoteContract.deploy(wallet, admin.address);
  await deployRequest.simulate({ from: admin.address });
  const { contract } = await deployRequest.send({
    from: admin.address,
    fee,
    wait: { timeout: timeouts.deployTimeout },
  });
  logger.info(`Contract: ${contract.address}`);

  const pollId = { id: new Fr(1) };
  logger.info("Creating poll…");
  await contract.methods
    .create_poll(pollId, 2, PRIVACY_VOTER_CHOICE, ELIGIBILITY_OPEN, new Fr(1), false, 0, 0, 1)
    .send({ from: admin.address, fee, wait: { timeout: timeouts.txTimeout } });

  logger.info("Private vote (Happy)…");
  await contract.methods
    .cast_vote_private(pollId, new Fr(0), new Fr(0), new Fr(Math.floor(Date.now() / 1000 / 86400)))
    .send({ from: voter.address, fee, wait: { timeout: timeouts.txTimeout } });

  const happyRaw = await contract.methods.get_tally(pollId, new Fr(0)).simulate({ from: voter.address });
  const happy = asBigInt(happyRaw);
  if (happy !== 1n) throw new Error(`Expected happy tally 1, got ${happy}`);

  logger.info("Second voter open vote (Sad)…");
  const voter2 = await deploySchnorrAccount(wallet);
  await contract.methods
    .cast_vote_open(pollId, new Fr(1), new Fr(0), new Fr(Math.floor(Date.now() / 1000 / 86400)))
    .send({ from: voter2.address, fee, wait: { timeout: timeouts.txTimeout } });

  const sad = asBigInt(
    await contract.methods.get_tally(pollId, new Fr(1)).simulate({ from: voter2.address }),
  );
  const total = asBigInt(
    await contract.methods.get_total_votes(pollId).simulate({ from: voter2.address }),
  );
  if (sad !== 1n || total !== 2n) {
    throw new Error(`Unexpected tallies sad=${sad} total=${total}`);
  }

  logger.info("SMOKE OK");
  logger.info(`HAPPY_VOTE_CONTRACT_ADDRESS=${contract.address}`);
  logger.info(`VITE_HAPPY_VOTE_CONTRACT_ADDRESS=${contract.address}`);
  logger.info(`PollId struct shape for TS: { id: Fr }`);

  // Keep web frontend pointed at the fresh local deploy
  try {
    const { writeFileSync } = await import("node:fs");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const envPath = resolve(root, "web/.env.local");
    const envBody = [
      "VITE_AZTEC_NODE_URL=http://localhost:8080",
      `VITE_HAPPY_VOTE_CONTRACT_ADDRESS=${contract.address}`,
      "VITE_DEFAULT_POLL_ID=1",
      "VITE_SPONSORED_FPC_ADDRESS=0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296",
      "VITE_PROVER_ENABLED=false",
      "VITE_REQUIRE_ZKPASSPORT=false",
      "",
    ].join("\n");
    writeFileSync(envPath, envBody, "utf8");
    logger.info(`Wrote ${envPath}`);
  } catch (error) {
    logger.warn(`Could not write web/.env.local: ${String(error)}`);
  }
}

main().catch((error) => {
  console.error("SMOKE FAILED", error);
  process.exit(1);
});
