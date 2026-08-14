/**
 * Create a poll on a deployed HappyVote contract (admin account).
 *
 * Env:
 *   HAPPY_VOTE_CONTRACT_ADDRESS (required)
 *   POLL_ID (default 1)
 *   OPTIONS_COUNT (default 2; max 32)
 *   PRIVACY_POLICY (default 2 = voter_choice)
 *   ELIGIBILITY (default 0 = open; 1 = personhood; 2 = gated)
 *   REQUIREMENTS_JSON — optional JSON string; hashed (sha256) into metadata_hash
 *   METADATA_HASH — used when REQUIREMENTS_JSON unset (default 1)
 *   SECRET_KEY / SIGNING_KEY / SALT — reuse admin (SKIP_ACCOUNT_DEPLOY auto when set)
 */
import "dotenv/config";
import { HappyVoteContract } from "../src/artifacts/HappyVote.js";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { type Logger, createLogger } from "@aztec/foundation/log";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { setupWallet } from "../src/utils/setup_wallet.js";
import { getSponsoredFPCInstance } from "../src/utils/sponsored_fpc.js";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";
import { deploySchnorrAccount } from "../src/utils/deploy_account.js";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TxStatus } from "@aztec/stdlib/tx";
import { getAztecNodeUrl, getTimeouts } from "../config/config.js";
import { createHash } from "node:crypto";

const PRIVACY_VOTER_CHOICE = 2;
const ELIGIBILITY_OPEN = 0;
const ELIGIBILITY_GATED = 2;
const MAX_OPTIONS = 32;

function asU32(name: string, raw: string | undefined, fallback: number): number {
  const value = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${raw}`);
  }
  return value;
}

function metadataFromRequirementsJson(raw: string): Fr {
  const digest = createHash("sha256").update(raw, "utf8").digest();
  return Fr.fromBufferReduce(digest);
}

async function main() {
  const logger: Logger = createLogger("aztec:happy-vote:create-poll");
  const contractAddress = process.env.HAPPY_VOTE_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("HAPPY_VOTE_CONTRACT_ADDRESS is required");
  }

  const pollId = { id: Fr.fromString(process.env.POLL_ID ?? "1") };
  const optionsCount = asU32("OPTIONS_COUNT", process.env.OPTIONS_COUNT, 2);
  if (optionsCount < 2 || optionsCount > MAX_OPTIONS) {
    throw new Error(`OPTIONS_COUNT must be 2..${MAX_OPTIONS}, got ${optionsCount}`);
  }
  const privacyPolicy = asU32("PRIVACY_POLICY", process.env.PRIVACY_POLICY, PRIVACY_VOTER_CHOICE);
  let eligibility = asU32("ELIGIBILITY", process.env.ELIGIBILITY, ELIGIBILITY_OPEN);
  if (eligibility > ELIGIBILITY_GATED) {
    throw new Error(`ELIGIBILITY must be 0..2, got ${eligibility}`);
  }

  let metadataHash: Fr;
  if (process.env.REQUIREMENTS_JSON) {
    metadataHash = metadataFromRequirementsJson(process.env.REQUIREMENTS_JSON);
    if (eligibility === ELIGIBILITY_OPEN) {
      eligibility = 1;
    }
  } else {
    metadataHash = Fr.fromString(process.env.METADATA_HASH ?? "1");
  }
  const sealed =
    process.env.SEALED === "1" ||
    process.env.SEALED === "true" ||
    process.env.SEALED === "TRUE";
  const startsAt = asU32("STARTS_AT", process.env.STARTS_AT, 0);
  const endsAt = asU32("ENDS_AT", process.env.ENDS_AT, 0);
  const timeouts = getTimeouts();

  const wallet = await setupWallet();
  const sponsoredFPC = await getSponsoredFPCInstance();
  await wallet.registerContract(sponsoredFPC, SponsoredFPCContractArtifact);
  const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

  const accountManager = await deploySchnorrAccount(wallet);
  const from = accountManager.address;

  const address = AztecAddress.fromStringUnsafe(contractAddress);
  const node = createAztecNodeClient(getAztecNodeUrl());
  const instance = await node.getContract(address);
  if (!instance) {
    throw new Error(`Contract not found on node: ${contractAddress}`);
  }
  await wallet.registerContract(instance, HappyVoteContract.artifact);
  const contract = await HappyVoteContract.at(address, wallet);

  const waitSeconds = timeouts.txTimeout > 10_000 ? Math.ceil(timeouts.txTimeout / 1000) : timeouts.txTimeout;
  logger.info(
    `Creating poll ${pollId.id} options=${optionsCount} privacy=${privacyPolicy} eligibility=${eligibility} sealed=${sealed} startsAt=${startsAt} endsAt=${endsAt} on ${contractAddress}`,
  );
  await contract.methods
    .create_poll(
      pollId,
      optionsCount,
      privacyPolicy,
      eligibility,
      metadataHash,
      sealed,
      startsAt,
      endsAt,
    )
    .send({
      from,
      fee: { paymentMethod: sponsoredPaymentMethod },
      wait: {
        timeout: waitSeconds,
        interval: 8,
        ignoreDroppedReceiptsFor: 180,
        waitForStatus: TxStatus.PROPOSED,
      },
    });

  const options = await contract.methods.get_options_count(pollId).simulate({ from });
  const optionsCountResult =
    typeof options === "object" && options !== null && "result" in options
      ? options.result
      : options;
  logger.info(`Poll created. options_count=${optionsCountResult} metadata=${metadataHash}`);
}

main().catch((error) => {
  console.error("create-poll failed:", error);
  process.exit(1);
});
