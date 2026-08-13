import { fetchPublicPollState } from "../src/lib/publicPollState.js";

const r = await fetchPublicPollState({
  nodeUrl: "https://v5.testnet.rpc.aztec-labs.com",
  contractAddress: "0x1cf26ae917e41fd3085ad79017b2ec6175e80284f0ac066e6f28eb3b878f82df",
  pollId: 1,
  optionsCount: 2,
});
console.log(JSON.stringify(r));
