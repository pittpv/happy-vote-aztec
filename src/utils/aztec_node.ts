import { createAztecNodeClient } from "@aztec-labs/aztec.js/node";

/** dRPC's free Testnet plan rejects JSON-RPC batches larger than 3. */
export const RPC_MAX_BATCH_SIZE = 3;

export function createHappyVoteNode(url: string) {
  return createAztecNodeClient(url, { maxBatchSize: RPC_MAX_BATCH_SIZE });
}
