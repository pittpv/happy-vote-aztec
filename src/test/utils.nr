use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

use crate::HappyVote;

pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let admin = env.create_light_account();

    let initializer_call = HappyVote::interface().constructor(admin);
    let contract_address = env.deploy("HappyVote").with_public_initializer(admin, initializer_call);

    (env, contract_address, admin)
}

pub unconstrained fn create_poll(
    env: &mut TestEnvironment,
    contract_address: AztecAddress,
    admin: AztecAddress,
    poll_id: HappyVote::PollId,
    options_count: u32,
    privacy_policy: u8,
    eligibility_mode: u8,
    metadata_hash: Field,
    sealed: bool,
    starts_at: u64,
    ends_at: u64,
) {
    env.call_public(
        admin,
        HappyVote::at(contract_address).create_poll(
            poll_id,
            options_count,
            privacy_policy,
            eligibility_mode,
            metadata_hash,
            sealed,
            starts_at,
            ends_at,
        ),
    );
}

/// Happy/Sad binary poll with voter_choice privacy (policy = 2), open-ended window.
pub unconstrained fn create_happy_sad_poll(
    env: &mut TestEnvironment,
    contract_address: AztecAddress,
    admin: AztecAddress,
    poll_id: HappyVote::PollId,
) {
    create_poll(env, contract_address, admin, poll_id, 2, 2, 0, 1, false, 0, 0);
}
