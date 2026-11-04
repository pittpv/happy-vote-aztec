/**
 * E2E HappyVote smoke tests — require:
 * 1. `aztec start --local-network`
 * 2. `yarn compile:codegen`
 * 3. `yarn test:js`
 *
 * Noir unit tests (`yarn test:nr`) cover contract logic without a running network.
 */
import { HappyVoteContract } from "../../artifacts/HappyVote.js";
import { SponsoredFeePaymentMethod } from "@aztec-labs/aztec.js/fee";
import { getSponsoredFPCInstance } from "../../utils/sponsored_fpc.js";
import { setupWallet } from "../../utils/setup_wallet.js";
import { SponsoredFPCContractArtifact } from "@aztec-labs/noir-contracts.js/SponsoredFPC";
import { getTimeouts } from "../../../config/config.js";
import { Fr } from "@aztec-labs/aztec.js/fields";
import { type Logger, createLogger } from "@aztec-labs/foundation/log";
import { deploySchnorrAccount } from "../../utils/deploy_account.js";

const PRIVACY_VOTER_CHOICE = 2;
const ELIGIBILITY_OPEN = 0;

describe("HappyVote e2e", () => {
    jest.setTimeout(getTimeouts().deployTimeout * 1000);

    let logger: Logger;
    let contract: HappyVoteContract;
    let adminAddress: Awaited<ReturnType<typeof deploySchnorrAccount>>["address"];
    let voterAddress: Awaited<ReturnType<typeof deploySchnorrAccount>>["address"];
    let sponsoredPaymentMethod: SponsoredFeePaymentMethod;

    beforeAll(async () => {
        logger = createLogger("aztec:happy-vote:e2e");
        const wallet = await setupWallet();
        const sponsoredFPC = await getSponsoredFPCInstance();
        await wallet.registerContract(sponsoredFPC, SponsoredFPCContractArtifact);
        sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

        const admin = await deploySchnorrAccount(wallet);
        adminAddress = admin.address;
        const voter = await deploySchnorrAccount(wallet);
        voterAddress = voter.address;

        const timeouts = getTimeouts();
        ({ contract } = await HappyVoteContract.deploy(wallet, adminAddress).send({
            from: adminAddress,
            fee: { paymentMethod: sponsoredPaymentMethod },
            wait: { timeout: timeouts.deployTimeout },
        }));
        logger.info(`Deployed HappyVote at ${contract.address}`);
    });

    it("creates Happy/Sad poll and accepts a private vote", async () => {
        const timeouts = getTimeouts();
        const pollId = { id: new Fr(1) };
        const metadataHash = new Fr(1);

        await contract.methods
            .create_poll(pollId, 2, PRIVACY_VOTER_CHOICE, ELIGIBILITY_OPEN, metadataHash, false, 0, 0, 0)
            .send({
                from: adminAddress,
                fee: { paymentMethod: sponsoredPaymentMethod },
                wait: { timeout: timeouts.txTimeout ?? timeouts.deployTimeout },
            });

        await contract.methods.cast_vote_private(pollId, new Fr(0), new Fr(0), new Fr(0)).send({
            from: voterAddress,
            fee: { paymentMethod: sponsoredPaymentMethod },
            wait: { timeout: timeouts.txTimeout ?? timeouts.deployTimeout },
        });

        const tally = await contract.methods.get_tally(pollId, new Fr(0)).simulate({ from: voterAddress });
        expect(tally).toEqual(1n);
    });
});
