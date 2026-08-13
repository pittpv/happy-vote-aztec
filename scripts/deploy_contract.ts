import { HappyVoteContract } from "../src/artifacts/HappyVote.js";
import { type Logger, createLogger } from "@aztec/foundation/log";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { setupWallet } from "../src/utils/setup_wallet.js";
import { getSponsoredFPCInstance } from "../src/utils/sponsored_fpc.js";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";
import { deploySchnorrAccount } from "../src/utils/deploy_account.js";
import { getTimeouts } from "../config/config.js";

async function main() {
    const logger: Logger = createLogger("aztec:happy-vote");
    logger.info("Starting HappyVote contract deployment...");

    const timeouts = getTimeouts();
    const wallet = await setupWallet();
    const sponsoredFPC = await getSponsoredFPCInstance();
    await wallet.registerContract(sponsoredFPC, SponsoredFPCContractArtifact);
    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

    const accountManager = await deploySchnorrAccount(wallet);
    const address = accountManager.address;
    logger.info(`Admin account: ${address}`);

    const deployRequest = HappyVoteContract.deploy(wallet, address);
    await deployRequest.simulate({ from: address });
    const { contract } = await deployRequest.send({
        from: address,
        fee: { paymentMethod: sponsoredPaymentMethod },
        wait: { timeout: timeouts.deployTimeout },
    });

    logger.info(`HappyVote deployed at: ${contract.address}`);
    logger.info(`Set HAPPY_VOTE_CONTRACT_ADDRESS=${contract.address} in .env`);
}

main().catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
});
