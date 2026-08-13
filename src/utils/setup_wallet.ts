import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { getAztecNodeUrl } from '../../config/config.js';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

export async function setupWallet(): Promise<EmbeddedWallet> {
    const nodeUrl = getAztecNodeUrl();
    const node = createAztecNodeClient(nodeUrl);
    const env = process.env.AZTEC_ENV || "local-network";
    const proverEnabled =
        process.env.PROVER_ENABLED === "true" ||
        (process.env.PROVER_ENABLED !== "false" && env === "testnet");
    const wallet = await EmbeddedWallet.create(node, {
        ephemeral: true,
        pxeConfig: { proverEnabled },
    });
    return wallet;
}
