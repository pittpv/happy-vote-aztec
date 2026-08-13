use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

use crate::HappyVote;

pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let admin = env.create_light_account();

    let initializer_call = HappyVote::interface().constructor(admin);
    let contract_address = env.deploy("HappyVote").with_public_initializer(admin, initializer_call);

    (env, contract_address, admin)
}

/// Happy/Sad binary poll with voter_choice privacy (policy = 2).
pub unconstrained fn create_happy_sad_poll(
    env: &mut TestEnvironment,
    contract_address: AztecAddress,
    admin: AztecAddress,
    poll_id: HappyVote::PollId,
) {
    let options_count: u32 = 2;
    let privacy_voter_choice: u8 = 2;
    let eligibility_open: u8 = 0;
    let metadata_hash: Field = 1;
    env.call_public(
        admin,
        HappyVote::at(contract_address).create_poll(
            poll_id,
            options_count,
            privacy_voter_choice,
            eligibility_open,
            metadata_hash,
            false,
        ),
    );
}
