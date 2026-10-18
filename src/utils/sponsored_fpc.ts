import { Fr } from '@aztec-labs/aztec.js/fields';
import {
  getContractInstanceFromInstantiationParams,
  type ContractInstanceWithAddress,
} from '@aztec-labs/aztec.js/contracts';
import type { Wallet } from '@aztec-labs/aztec.js/wallet';
import type { LogFn } from '@aztec-labs/foundation/log';
import { SponsoredFPCContract, SponsoredFPCContractArtifact } from '@aztec-labs/noir-contracts.js/SponsoredFPC';
import { SPONSORED_FPC_SALT } from '@aztec-labs/constants';

// docs:start:get-sponsored-fpc
export async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromInstantiationParams(SponsoredFPCContractArtifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });
}
// docs:end:get-sponsored-fpc

export async function getSponsoredFPCAddress() {
  return (await getSponsoredFPCInstance()).address;
}

export async function setupSponsoredFPC(deployer: Wallet, log: LogFn) {
  const [{ item: from }] = await deployer.getAccounts();
  const deployRequest = SponsoredFPCContract.deploy(deployer, {
    salt: new Fr(SPONSORED_FPC_SALT),
    universalDeploy: true,
  });
  // Simulate before sending to surface revert reasons
  await deployRequest.simulate({ from });
  const { contract: deployed } = await deployRequest
    .send({
      from,
    });

  log(`SponsoredFPC: ${deployed.address}`);
}
