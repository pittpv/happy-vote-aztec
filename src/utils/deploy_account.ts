import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { getSponsoredFPCInstance } from "./sponsored_fpc.js";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";
import { Fr } from "@aztec/aztec.js/fields";
import { GrumpkinScalar } from "@aztec/foundation/curves/grumpkin";
import { type Logger, createLogger } from "@aztec/foundation/log";
import { setupWallet } from "./setup_wallet.js";
import { AccountManager } from "@aztec/aztec.js/wallet";
import { NO_FROM } from "@aztec/aztec.js/account";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getTimeouts } from "../../config/config.js";

function waitSeconds(): number {
    const raw = getTimeouts().deployTimeout;
    // Config historically stored milliseconds; WaitOpts.timeout is seconds.
    return raw > 10_000 ? Math.ceil(raw / 1000) : raw;
}

export async function deploySchnorrAccount(wallet?: EmbeddedWallet): Promise<AccountManager> {
    let logger: Logger;
    logger = createLogger('aztec:aztec-starter');
    logger.info('👤 Starting Schnorr account deployment...');

    logger.info('🔐 Generating account keys...');
    const hadEnvKeys = Boolean(
        process.env.SECRET_KEY && process.env.SIGNING_KEY && process.env.SALT,
    );
    const secretKey = process.env.SECRET_KEY ? Fr.fromString(process.env.SECRET_KEY) : Fr.random();
    const signingKey = process.env.SIGNING_KEY
        ? GrumpkinScalar.fromString(process.env.SIGNING_KEY)
        : GrumpkinScalar.random();
    const salt = process.env.SALT ? Fr.fromString(process.env.SALT) : Fr.random();
    logger.info(`Save SECRET_KEY / SIGNING_KEY / SALT in .env for future use (values not logged).`);
    if (!hadEnvKeys) {
        logger.info(`🔑 Generated new account keys (persisted to process.env for this run).`);
    } else {
        logger.info(`🔑 Reusing account keys from environment.`);
    }
    process.env.SECRET_KEY = secretKey.toString();
    process.env.SIGNING_KEY = signingKey.toString();
    process.env.SALT = salt.toString();

    const activeWallet = wallet ?? await setupWallet()
    const account = await activeWallet.createSchnorrAccount(secretKey, salt, signingKey)
    logger.info(`📍 Account address will be: ${account.address}`);

    // Setup sponsored FPC (needed whether we deploy or reuse)
    logger.info('💰 Setting up sponsored fee payment for account deployment...');
    const sponsoredFPC = await getSponsoredFPCInstance();
    logger.info(`💰 Sponsored FPC instance obtained at: ${sponsoredFPC.address}`);

    logger.info('📝 Registering sponsored FPC contract with PXE...');
    await activeWallet.registerContract(sponsoredFPC, SponsoredFPCContractArtifact);
    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);
    logger.info('✅ Sponsored fee payment method configured for account deployment');

    const forceDeploy = process.env.FORCE_ACCOUNT_DEPLOY === "true";
    const skipDeploy =
        process.env.SKIP_ACCOUNT_DEPLOY === "true" || (!forceDeploy && hadEnvKeys);

    if (skipDeploy) {
        // Keys from .env imply a previously deployed admin on testnet. Re-broadcasting
        // the same init nullifier is rejected ("Existing nullifier").
        logger.info(`✅ Skipping account deploy (reuse keys from env). Set FORCE_ACCOUNT_DEPLOY=true to force.`);
        return account;
    }

    const { createAztecNodeClient } = await import("@aztec/aztec.js/node");
    const { getAztecNodeUrl } = await import("../../config/config.js");
    const node = createAztecNodeClient(getAztecNodeUrl());
    const existing = await node.getContract(account.address);
    if (existing) {
        logger.info(`✅ Account already deployed on-chain — skipping account deploy.`);
        return account;
    }

    const deployMethod = await account.getDeployMethod();

    // Simulate before sending to surface revert reasons
    await deployMethod.simulate({
        from: NO_FROM,
    });
    logger.info('✅ Simulation successful, sending deployment transaction...');

    try {
        await deployMethod.send({
            from: NO_FROM,
            fee: { paymentMethod: sponsoredPaymentMethod },
            wait: { timeout: waitSeconds() },
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (/Existing nullifier/i.test(msg)) {
            logger.info(`✅ Account init nullifier already on-chain — continuing with existing account.`);
            return account;
        }
        throw error;
    }

    logger.info(`✅ Account deployment transaction successful!`);

    return account;
}