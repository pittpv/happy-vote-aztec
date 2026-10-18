import { fetchPublicPollState } from "../src/lib/publicPollState.js";

const r = await fetchPublicPollState({
  nodeUrl: "https://aztec-testnet.drpc.org",
  contractAddress: "0x147d56082a923fb872c9ea28e4e57b3596f27b518f95c51c825839024d61beba",
  pollId: 1,
  optionsCount: 2,
});
console.log(JSON.stringify(r));
