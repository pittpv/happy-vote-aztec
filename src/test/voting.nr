use crate::test::utils;
use aztec::protocol::{address::AztecAddress, storage::map::derive_storage_slot_in_map};
use aztec::test::helpers::test_environment::TestEnvironment;

use crate::HappyVote;
use crate::HappyVote::PollId;

global TEST_X_HI: Field = 152337007381914678539486006480172459201;
global TEST_X_LO: Field = 165563735343898171050569051358257504200;
global TEST_Y_HI: Field = 51761476565548422634248270941973441522;
global TEST_Y_LO: Field = 273828425013984694658547760938043057904;

unconstrained fn install_test_zk_signer(env: &mut TestEnvironment, contract_address: AztecAddress, admin: AztecAddress) {
    env.call_public(
        admin,
        HappyVote::at(contract_address).set_zk_signer(
            TEST_X_HI as u128,
            TEST_X_LO as u128,
            TEST_Y_HI as u128,
            TEST_Y_LO as u128,
        ),
    );
}

unconstrained fn sig_identity_a() -> ([u8; 32], [u8; 32]) {
    (
        [79, 133, 15, 5, 79, 53, 70, 222, 74, 48, 198, 185, 57, 155, 178, 103, 137, 22, 223, 104, 52, 186, 179, 172, 245, 10, 254, 204, 81, 2, 54, 121],
        [78, 13, 147, 93, 211, 222, 42, 100, 214, 250, 161, 221, 198, 177, 196, 192, 208, 246, 38, 47, 20, 92, 157, 205, 129, 25, 218, 141, 171, 163, 89, 97],
    )
}

unconstrained fn sig_identity_b() -> ([u8; 32], [u8; 32]) {
    (
        [211, 179, 98, 171, 217, 95, 83, 15, 168, 20, 104, 169, 233, 119, 67, 61, 150, 246, 114, 231, 219, 252, 122, 36, 112, 10, 133, 129, 58, 20, 105, 29],
        [99, 37, 114, 169, 179, 228, 53, 166, 97, 87, 66, 187, 15, 27, 11, 84, 132, 254, 118, 154, 128, 88, 105, 137, 8, 25, 18, 231, 96, 63, 105, 97],
    )
}

unconstrained fn sig_identity_shared() -> ([u8; 32], [u8; 32]) {
    (
        [129, 233, 8, 112, 160, 248, 221, 201, 6, 63, 35, 14, 123, 247, 211, 12, 120, 25, 48, 158, 100, 15, 97, 103, 81, 205, 152, 175, 208, 83, 249, 193],
        [111, 47, 196, 5, 226, 53, 206, 172, 63, 1, 151, 238, 228, 1, 6, 130, 244, 232, 95, 137, 105, 72, 31, 32, 178, 208, 12, 27, 47, 185, 155, 174],
    )
}

unconstrained fn sig_identity_day1() -> ([u8; 32], [u8; 32]) {
    (
        [93, 201, 160, 240, 151, 233, 0, 233, 216, 241, 226, 240, 161, 12, 28, 249, 110, 227, 133, 169, 147, 2, 44, 54, 67, 137, 106, 48, 50, 109, 108, 81],
        [11, 196, 133, 36, 153, 60, 50, 237, 101, 156, 246, 96, 233, 80, 28, 241, 78, 194, 20, 227, 98, 245, 233, 176, 250, 54, 68, 22, 7, 116, 249, 219],
    )
}

unconstrained fn sig_identity_day2() -> ([u8; 32], [u8; 32]) {
    (
        [12, 134, 5, 78, 201, 96, 88, 61, 41, 236, 30, 161, 156, 197, 57, 219, 21, 251, 238, 226, 45, 89, 52, 54, 6, 103, 253, 222, 167, 91, 134, 253],
        [113, 60, 70, 236, 25, 96, 171, 111, 45, 40, 43, 195, 159, 202, 40, 3, 196, 113, 135, 68, 224, 112, 38, 245, 5, 145, 5, 157, 97, 221, 249, 218],
    )
}

unconstrained fn sig_identity_same_day() -> ([u8; 32], [u8; 32]) {
    (
        [196, 59, 21, 50, 180, 52, 153, 118, 22, 214, 149, 72, 168, 134, 185, 91, 162, 226, 130, 249, 128, 15, 187, 249, 14, 77, 182, 249, 105, 183, 37, 115],
        [65, 219, 15, 135, 136, 230, 210, 206, 33, 73, 50, 104, 180, 75, 11, 238, 113, 4, 160, 27, 109, 96, 65, 74, 88, 8, 47, 167, 11, 231, 204, 162],
    )
}

#[test]
unconstrained fn test_initializer() {
    let (env, contract_address, admin) = utils::setup();

    env.public_context_at(contract_address, |context| {
        let current_admin = context.storage_read(HappyVote::storage_layout().admin.slot);
        assert_eq(current_admin, admin);
    });
}

#[test]
unconstrained fn test_create_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_id = PollId::new(Field::from(1));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);

    let options = env.view_public(HappyVote::at(contract_address).get_options_count(poll_id));
    assert_eq(options, 2);

    let policy = env.view_public(HappyVote::at(contract_address).get_privacy_policy(poll_id));
    assert_eq(policy, 2);

    let freq = env.view_public(HappyVote::at(contract_address).get_vote_frequency(poll_id));
    assert_eq(freq, 0);
}

#[test(should_fail_with = "Only admin")]
unconstrained fn test_fail_create_poll_non_admin() {
    let (mut env, contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(1));

    env.call_public(
        alice,
        HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 0, 1, false, 0, 0, 0),
    );
}

#[test(should_fail_with = "Poll already exists")]
unconstrained fn test_fail_duplicate_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_id = PollId::new(Field::from(1));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
}

#[test]
unconstrained fn test_cast_vote_private() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(42));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);

    // option 0 = Happy; identity_commitment = 0 for open eligibility
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));

    let tally = env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0));
    assert_eq(tally, 1);

    let total = env.view_public(HappyVote::at(contract_address).get_total_votes(poll_id));
    assert_eq(total, 1);
}

#[test]
unconstrained fn test_cast_vote_private_two_voters() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    let poll_id = PollId::new(Field::from(42));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);

    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
    env.call_private(bob, HappyVote::at(contract_address).cast_vote_private(poll_id, 1, 0, 0));

    let happy = env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0));
    let sad = env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 1));
    assert_eq(happy, 1);
    assert_eq(sad, 1);
}

#[test(should_fail_with = "duplicate siloed nullifier")]
unconstrained fn test_fail_double_vote_private() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(42));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);

    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 1, 0, 0));
}

#[test]
unconstrained fn test_cast_vote_open() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(7));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);

    env.call_private(alice, HappyVote::at(contract_address).cast_vote_open(poll_id, 1, 0, 0));

    let tally = env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 1));
    assert_eq(tally, 1);

    // Stored as option_id + 1
    let ballot = env.view_public(HappyVote::at(contract_address).get_open_ballot(poll_id, alice));
    assert_eq(ballot, 2);
}

#[test(should_fail_with = "duplicate siloed nullifier")]
unconstrained fn test_fail_private_then_open() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(8));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);

    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_open(poll_id, 1, 0, 0));
}

#[test]
unconstrained fn test_vote_two_polls() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_a = PollId::new(Field::from(10));
    let poll_b = PollId::new(Field::from(11));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_a);
    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_b);

    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_a, 0, 0, 0));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_b, 1, 0, 0));

    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_a, 0)), 1);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_b, 1)), 1);
}

#[test]
unconstrained fn test_end_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_id = PollId::new(Field::from(9));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_public(admin, HappyVote::at(contract_address).end_poll(poll_id));

    env.public_context_at(contract_address, |context| {
        let ended = context.storage_read(derive_storage_slot_in_map(
            HappyVote::storage_layout().vote_ended.slot,
            poll_id,
        ));
        assert_eq(ended, true);
    });
}

#[test(should_fail_with = "Only admin")]
unconstrained fn test_fail_end_poll_non_admin() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(9));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_public(alice, HappyVote::at(contract_address).end_poll(poll_id));
}

#[test(should_fail_with = "Vote has ended")]
unconstrained fn test_fail_vote_after_end() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(12));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_public(admin, HappyVote::at(contract_address).end_poll(poll_id));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
}

#[test(should_fail_with = "Poll requires private votes")]
unconstrained fn test_fail_open_on_private_only_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(13));

    // privacy_policy = 0 (private_only)
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 0, 0, 1, false, 0, 0, 0));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_open(poll_id, 0, 0, 0));
}

#[test(should_fail_with = "Poll requires open votes")]
unconstrained fn test_fail_private_on_public_only_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(14));

    // privacy_policy = 1 (public_only)
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 1, 0, 1, false, 0, 0, 0));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
}

#[test(should_fail_with = "Invalid option")]
unconstrained fn test_fail_invalid_option_out_of_range() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(15));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    // options_count = 2 → option 2 is invalid
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 2, 0, 0));
}

#[test(should_fail_with = "Invalid option")]
unconstrained fn test_fail_option_u32_truncation() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(16));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    // 2^32 truncates to 0 as u32; must still be rejected (would write wrong map key).
    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private(poll_id, Field::from(4294967296), 0, 0),
    );
}

#[test]
unconstrained fn test_create_poll_zkpassport_eligibility() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_personhood = PollId::new(Field::from(20));
    let poll_gated = PollId::new(Field::from(21));

    // eligibility = 1 personhood, 2 gated
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_personhood, 2, 2, 1, 11, false, 0, 0, 0));
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_gated, 3, 2, 2, 22, false, 0, 0, 0));

    let mode_p = env.view_public(HappyVote::at(contract_address).get_eligibility_mode(poll_personhood));
    let mode_g = env.view_public(HappyVote::at(contract_address).get_eligibility_mode(poll_gated));
    assert_eq(mode_p, 1);
    assert_eq(mode_g, 2);

    let meta = env.view_public(HappyVote::at(contract_address).get_metadata_hash(poll_gated));
    assert_eq(meta, 22);
}

#[test(should_fail_with = "Unsupported eligibility mode")]
unconstrained fn test_fail_invalid_eligibility_mode() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_id = PollId::new(Field::from(22));
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 3, 1, false, 0, 0, 0));
}

#[test]
unconstrained fn test_direct_zk_sig() {
    let (sig_r, sig_s) = sig_identity_a();
    crate::assert_zk_attestation(
        TEST_X_HI as u128,
        TEST_X_LO as u128,
        TEST_Y_HI as u128,
        TEST_Y_LO as u128,
        30,
        111,
        0,
        4000000600,
        sig_r,
        sig_s,
    );
}

#[test]
unconstrained fn test_zkpassport_identity_vote() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    let poll_id = PollId::new(Field::from(30));
    let identity_a = Field::from(111);
    let identity_b = Field::from(222);

    // eligibility personhood = 1
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 1, 99, false, 0, 0, 0));
    install_test_zk_signer(&mut env, contract_address, admin);
    env.mine_block_at(4000000000);
    let (sig_a_r, sig_a_s) = sig_identity_a();
    let (sig_b_r, sig_b_s) = sig_identity_b();

    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private_attested(poll_id, 0, identity_a, 0, 4000000600, TEST_X_HI, TEST_X_LO, TEST_Y_HI, TEST_Y_LO, sig_a_r, sig_a_s),
    );
    env.call_private(
        bob,
        HappyVote::at(contract_address).cast_vote_private_attested(poll_id, 1, identity_b, 0, 4000000600, TEST_X_HI, TEST_X_LO, TEST_Y_HI, TEST_Y_LO, sig_b_r, sig_b_s),
    );

    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 1);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 1)), 1);
    assert_eq(
        env.view_public(HappyVote::at(contract_address).has_identity_voted(poll_id, identity_a)),
        true,
    );
}

#[test(should_fail_with = "Identity already voted")]
unconstrained fn test_fail_same_identity_two_accounts() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    let poll_id = PollId::new(Field::from(31));
    let shared_identity = Field::from(777);

    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 1, 99, false, 0, 0, 0));
    install_test_zk_signer(&mut env, contract_address, admin);
    env.mine_block_at(4000000000);
    let (sig_r, sig_s) = sig_identity_shared();

    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private_attested(poll_id, 0, shared_identity, 0, 4000000600, TEST_X_HI, TEST_X_LO, TEST_Y_HI, TEST_Y_LO, sig_r, sig_s),
    );
    // Same ZKPassport UID, different Aztec account → reject
    env.call_private(
        bob,
        HappyVote::at(contract_address).cast_vote_private_attested(poll_id, 1, shared_identity, 0, 4000000600, TEST_X_HI, TEST_X_LO, TEST_Y_HI, TEST_Y_LO, sig_r, sig_s),
    );
}

#[test(should_fail_with = "ZKPassport identity required")]
unconstrained fn test_fail_personhood_without_identity() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(32));

    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 1, 99, false, 0, 0, 0));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
}

#[test(should_fail_with = "Identity not allowed for open polls")]
unconstrained fn test_fail_identity_on_open_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(33));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 0, Field::from(55), 0),
    );
}

#[test(should_fail_with = "Sealed ballot uses the tally book")]
unconstrained fn test_sealed_hides_tallies_until_end() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(40));

    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 0, 1, true, 0, 0, 0));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_sealed(poll_id)), true);
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
}

#[test(should_fail_with = "Sealed poll cannot be open-only")]
unconstrained fn test_fail_sealed_open_only() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_id = PollId::new(Field::from(92));
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 1, 0, 1, true, 0, 0, 0));
}

#[test]
unconstrained fn test_next_poll_id_auto_assign() {
    let (mut env, contract_address, admin) = utils::setup();
    assert_eq(env.view_public(HappyVote::at(contract_address).get_next_poll_id()), 1);

    env.call_public(
        admin,
        HappyVote::at(contract_address).create_poll(PollId::new(0), 2, 2, 0, 1, false, 0, 0, 0),
    );

    assert_eq(env.view_public(HappyVote::at(contract_address).get_options_count(PollId::new(1))), 2);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_next_poll_id()), 2);
    assert_eq(env.view_public(HappyVote::at(contract_address).is_voting_open(PollId::new(1))), true);
}

#[test]
unconstrained fn test_next_poll_id_bumps_past_custom_id() {
    let (mut env, contract_address, admin) = utils::setup();
    utils::create_happy_sad_poll(&mut env, contract_address, admin, PollId::new(Field::from(5)));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_next_poll_id()), 6);
}

#[test(should_fail_with = "Poll not started")]
unconstrained fn test_fail_vote_before_start() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(50));
    let starts_at = env.last_block_timestamp() + 1000;

    utils::create_poll(&mut env, contract_address, admin, poll_id, 2, 2, 0, 1, false, starts_at, 0, 0);
    assert_eq(env.view_public(HappyVote::at(contract_address).is_voting_open(poll_id)), false);
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
}

#[test]
unconstrained fn test_vote_after_start() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(51));
    let starts_at = env.last_block_timestamp() + 100;

    utils::create_poll(&mut env, contract_address, admin, poll_id, 2, 2, 0, 1, false, starts_at, 0, 0);
    env.mine_block_at(starts_at);
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 1);
}

#[test(should_fail_with = "Vote has ended")]
unconstrained fn test_fail_vote_after_ends_at() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(52));
    let ends_at = env.last_block_timestamp() + 100;

    utils::create_poll(&mut env, contract_address, admin, poll_id, 2, 2, 0, 1, false, 0, ends_at, 0);
    env.mine_block_at(ends_at);
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
}

#[test(should_fail_with = "End must be after start")]
unconstrained fn test_fail_end_before_start() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_id = PollId::new(Field::from(53));
    utils::create_poll(&mut env, contract_address, admin, poll_id, 2, 2, 0, 1, false, 200, 100, 0);
}

#[test(should_fail_with = "End must be in the future")]
unconstrained fn test_fail_end_in_the_past() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_id = PollId::new(Field::from(54));
    env.mine_block_at(env.last_block_timestamp() + 1000);
    utils::create_poll(&mut env, contract_address, admin, poll_id, 2, 2, 0, 1, false, 0, 500, 0);
}

#[test(should_fail_with = "Sealed ballot uses the tally book")]
unconstrained fn test_sealed_reveals_after_ends_at() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(55));
    let ends_at = env.last_block_timestamp() + 200;

    utils::create_poll(&mut env, contract_address, admin, poll_id, 2, 2, 0, 1, true, 0, ends_at, 0);
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
}

#[test]
unconstrained fn test_transfer_admin() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    env.call_public(admin, HappyVote::at(contract_address).transfer_admin(alice));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_admin()), alice);

    let poll_id = PollId::new(Field::from(60));
    utils::create_happy_sad_poll(&mut env, contract_address, alice, poll_id);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_options_count(poll_id)), 2);
}

#[test(should_fail_with = "Only admin")]
unconstrained fn test_fail_create_after_transfer() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    env.call_public(admin, HappyVote::at(contract_address).transfer_admin(alice));
    utils::create_happy_sad_poll(&mut env, contract_address, admin, PollId::new(Field::from(61)));
}

#[test]
unconstrained fn test_cancel_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_id = PollId::new(Field::from(70));
    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_public(admin, HappyVote::at(contract_address).cancel_poll(poll_id));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_cancelled(poll_id)), true);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_vote_ended(poll_id)), true);
    assert_eq(env.view_public(HappyVote::at(contract_address).is_voting_open(poll_id)), false);
}

#[test(should_fail_with = "Poll already has votes")]
unconstrained fn test_fail_cancel_after_votes() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(71));
    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
    env.call_public(admin, HappyVote::at(contract_address).cancel_poll(poll_id));
}

#[test(should_fail_with = "Vote has ended")]
unconstrained fn test_fail_vote_after_cancel() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(72));
    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_public(admin, HappyVote::at(contract_address).cancel_poll(poll_id));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
}

#[test(should_fail_with = "Contract is paused")]
unconstrained fn test_fail_create_when_paused() {
    let (mut env, contract_address, admin) = utils::setup();
    env.call_public(admin, HappyVote::at(contract_address).set_paused(true));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_paused()), true);
    utils::create_happy_sad_poll(&mut env, contract_address, admin, PollId::new(Field::from(80)));
}

#[test(should_fail_with = "Contract is paused")]
unconstrained fn test_fail_vote_when_paused() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(81));
    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_public(admin, HappyVote::at(contract_address).set_paused(true));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
}

#[test]
unconstrained fn test_unpause_allows_vote() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(82));
    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_public(admin, HappyVote::at(contract_address).set_paused(true));
    env.call_public(admin, HappyVote::at(contract_address).set_paused(false));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 1);
}

#[test(should_fail_with = "Unsupported vote frequency")]
unconstrained fn test_fail_invalid_vote_frequency() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_id = PollId::new(Field::from(90));
    env.call_public(
        admin,
        HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 0, 1, false, 0, 0, 2),
    );
}

#[test]
unconstrained fn test_daily_vote_private_then_next_day() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(91));
    utils::create_daily_poll(&mut env, contract_address, admin, poll_id);

    let freq = env.view_public(HappyVote::at(contract_address).get_vote_frequency(poll_id));
    assert_eq(freq, 1);

    let period = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, period));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 1);

    env.mine_block_at(env.last_block_timestamp() + 86400);
    let next_period = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 1, 0, next_period));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 1);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 1)), 1);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_total_votes(poll_id)), 2);
}

#[test(should_fail_with = "duplicate siloed nullifier")]
unconstrained fn test_fail_daily_double_vote_same_day() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(92));
    utils::create_daily_poll(&mut env, contract_address, admin, poll_id);
    let period = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, period));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_open(poll_id, 1, 0, period));
}

#[test]
unconstrained fn test_daily_vote_open_then_next_day() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(93));
    utils::create_daily_poll(&mut env, contract_address, admin, poll_id);
    let period = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_open(poll_id, 0, 0, period));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_open_ballot(poll_id, alice)), 1);

    env.mine_block_at(env.last_block_timestamp() + 86400);
    let next_period = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_open(poll_id, 1, 0, next_period));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_open_ballot(poll_id, alice)), 2);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_total_votes(poll_id)), 2);
}

#[test(should_fail_with = "Wrong vote period")]
unconstrained fn test_fail_daily_wrong_period() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(94));
    utils::create_daily_poll(&mut env, contract_address, admin, poll_id);
    let period = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, period + 1),
    );
}

#[test(should_fail_with = "duplicate siloed nullifier")]
unconstrained fn test_fail_once_only_next_day() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(95));
    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
    env.mine_block_at(env.last_block_timestamp() + 86400);
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 1, 0, 0));
}

#[test]
unconstrained fn test_daily_identity_next_day() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    let poll_id = PollId::new(Field::from(96));
    let identity = Field::from(888);
    env.call_public(
        admin,
        HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 1, 99, false, 0, 0, 1),
    );
    install_test_zk_signer(&mut env, contract_address, admin);
    env.mine_block_at(4000000000);
    let (day1_r, day1_s) = sig_identity_day1();
    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private_attested(poll_id, 0, identity, 46296, 4000000600, TEST_X_HI, TEST_X_LO, TEST_Y_HI, TEST_Y_LO, day1_r, day1_s),
    );
    assert_eq(
        env.view_public(HappyVote::at(contract_address).has_identity_voted(poll_id, identity)),
        true,
    );

    env.mine_block_at(4000086400);
    let (day2_r, day2_s) = sig_identity_day2();
    env.call_private(
        bob,
        HappyVote::at(contract_address).cast_vote_private_attested(poll_id, 1, identity, 46297, 4000087000, TEST_X_HI, TEST_X_LO, TEST_Y_HI, TEST_Y_LO, day2_r, day2_s),
    );
    assert_eq(env.view_public(HappyVote::at(contract_address).get_total_votes(poll_id)), 2);
}

#[test(should_fail_with = "Identity already voted")]
unconstrained fn test_fail_daily_identity_same_day() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    let poll_id = PollId::new(Field::from(97));
    let identity = Field::from(999);
    env.call_public(
        admin,
        HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 1, 99, false, 0, 0, 1),
    );
    install_test_zk_signer(&mut env, contract_address, admin);
    env.mine_block_at(4000000000);
    let (sig_r, sig_s) = sig_identity_same_day();
    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private_attested(poll_id, 0, identity, 46296, 4000000600, TEST_X_HI, TEST_X_LO, TEST_Y_HI, TEST_Y_LO, sig_r, sig_s),
    );
    env.call_private(
        bob,
        HappyVote::at(contract_address).cast_vote_private_attested(poll_id, 1, identity, 46296, 4000000600, TEST_X_HI, TEST_X_LO, TEST_Y_HI, TEST_Y_LO, sig_r, sig_s),
    );
}

unconstrained fn user_create_at(
    env: &mut TestEnvironment,
    contract_address: AztecAddress,
    creator: AztecAddress,
    ends_at: u64,
    fee_mode: u8,
    fee_fallback: u8,
) {
    env.call_public(
        creator,
        HappyVote::at(contract_address).create_user_poll(
            2,
            2,
            0,
            7,
            false,
            0,
            ends_at,
            0,
            fee_mode,
            fee_fallback,
            3,
            4,
        ),
    );
}

#[test]
unconstrained fn test_user_create_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_at(&mut env, contract_address, alice, start + 86400, 0, 0);

    let poll_id = PollId::new(Field::from(1));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_creator(poll_id)), alice);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_fee_mode(poll_id)), 0);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_signing_pubkey_x(poll_id)), 3);
    assert(alice.eq(admin) == false);
    let _ = admin;
}

#[test]
unconstrained fn test_user_create_does_not_overwrite() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(1));
    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    let start = env.last_block_timestamp();
    user_create_at(&mut env, contract_address, alice, start + 86400, 0, 0);

    assert_eq(env.view_public(HappyVote::at(contract_address).get_options_count(poll_id)), 2);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_creator(poll_id)), admin);
    let user_poll = PollId::new(Field::from(2));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_creator(user_poll)), alice);
}

#[test(should_fail_with = "End is required")]
unconstrained fn test_fail_user_create_without_end() {
    let (mut env, contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    user_create_at(&mut env, contract_address, alice, 0, 0, 0);
}

#[test(should_fail_with = "Window exceeds 90 days")]
unconstrained fn test_fail_user_create_window() {
    let (mut env, contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_at(&mut env, contract_address, alice, start + 7776001, 0, 0);
}

#[test(should_fail_with = "Contract is paused")]
unconstrained fn test_fail_user_create_while_paused() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    env.call_public(admin, HappyVote::at(contract_address).set_paused(true));
    let start = env.last_block_timestamp();
    user_create_at(&mut env, contract_address, alice, start + 86400, 0, 0);
}

#[test(should_fail_with = "Already created today")]
unconstrained fn test_fail_user_create_twice_same_day() {
    let (mut env, contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_at(&mut env, contract_address, alice, start + 86400, 0, 0);
    user_create_at(&mut env, contract_address, alice, start + 86400, 0, 0);
}

#[test(should_fail_with = "Too many open polls")]
unconstrained fn test_fail_fourth_open_user_poll() {
    let (mut env, contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let t0 = env.last_block_timestamp();
    let horizon = t0 + 86400 * 10;
    user_create_at(&mut env, contract_address, alice, horizon, 0, 0);
    env.set_next_block_timestamp(t0 + 86400);
    user_create_at(&mut env, contract_address, alice, horizon, 0, 0);
    env.set_next_block_timestamp(t0 + 86400 * 2);
    user_create_at(&mut env, contract_address, alice, horizon, 0, 0);
    env.set_next_block_timestamp(t0 + 86400 * 3);
    user_create_at(&mut env, contract_address, alice, horizon, 0, 0);
}

#[test]
unconstrained fn test_creator_can_end_user_poll() {
    let (mut env, contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_at(&mut env, contract_address, alice, start + 86400, 0, 0);
    let poll_id = PollId::new(Field::from(1));
    env.call_public(alice, HappyVote::at(contract_address).end_poll(poll_id));
    assert(env.view_public(HappyVote::at(contract_address).get_vote_ended(poll_id)));
}

#[test(should_fail_with = "Only admin")]
unconstrained fn test_fail_stranger_end_user_poll() {
    let (mut env, contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_at(&mut env, contract_address, alice, start + 86400, 0, 0);
    env.call_public(bob, HappyVote::at(contract_address).end_poll(PollId::new(Field::from(1))));
}

#[test]
unconstrained fn test_admin_can_cancel_user_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_at(&mut env, contract_address, alice, start + 86400, 0, 0);
    let poll_id = PollId::new(Field::from(1));
    env.call_public(admin, HappyVote::at(contract_address).cancel_poll(poll_id));
    assert(env.view_public(HappyVote::at(contract_address).get_cancelled(poll_id)));
}

#[test(should_fail_with = "Sponsored fees are not available")]
unconstrained fn test_fail_mainnet_rejects_sponsored() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    env.call_public(admin, HappyVote::at(contract_address).set_allow_sponsored(false));
    let start = env.last_block_timestamp();
    user_create_at(&mut env, contract_address, alice, start + 86400, 0, 0);
}

#[test]
unconstrained fn test_pool_pays_until_empty_then_fallback_and_refund() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let payer = env.create_light_account();
    env.call_public(admin, HappyVote::at(contract_address).set_pool_payer(payer));
    let start = env.last_block_timestamp();
    // fee mode pool (2), fallback stop (0)
    user_create_at(&mut env, contract_address, alice, start + 86400, 2, 0);
    let poll_id = PollId::new(Field::from(1));
    env.call_public(payer, HappyVote::at(contract_address).fund_pool(poll_id, 2, 200));
    assert_eq(
        env.view_public(HappyVote::at(contract_address).quote_pool(poll_id, 80)),
        0,
    );
    assert_eq(
        env.call_public(payer, HappyVote::at(contract_address).commit_pool_ballot(poll_id, 80)),
        0,
    );
    assert_eq(env.view_public(HappyVote::at(contract_address).get_pool_remaining(poll_id)), 1);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_pool_juice(poll_id)), 120);
    // Juice no longer covers this cap. Stop fallback, nothing spent.
    assert_eq(
        env.call_public(payer, HappyVote::at(contract_address).commit_pool_ballot(poll_id, 200)),
        2,
    );
    assert_eq(env.view_public(HappyVote::at(contract_address).get_pool_remaining(poll_id)), 1);
    assert_eq(
        env.call_public(payer, HappyVote::at(contract_address).commit_pool_ballot(poll_id, 80)),
        0,
    );
    assert_eq(env.view_public(HappyVote::at(contract_address).get_pool_remaining(poll_id)), 0);
    assert_eq(
        env.call_public(payer, HappyVote::at(contract_address).commit_pool_ballot(poll_id, 10)),
        2,
    );
    env.call_public(alice, HappyVote::at(contract_address).end_poll(poll_id));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_pool_juice(poll_id)), 0);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_pool_refunded(poll_id)), 40);
}

#[test(should_fail_with = "Only admin or pool payer")]
unconstrained fn test_fail_creator_cannot_fund_pool() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let payer = env.create_light_account();
    env.call_public(admin, HappyVote::at(contract_address).set_pool_payer(payer));
    let start = env.last_block_timestamp();
    user_create_at(&mut env, contract_address, alice, start + 86400, 2, 0);
    env.call_public(alice, HappyVote::at(contract_address).fund_pool(PollId::new(Field::from(1)), 1, 10));
}

#[test(should_fail_with = "ZK attestation rejected")]
unconstrained fn test_fail_bad_zk_attestation() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(30));
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 1, 99, false, 0, 0, 0));
    install_test_zk_signer(&mut env, contract_address, admin);
    env.mine_block_at(4000000000);
    let (mut sig_r, sig_s) = sig_identity_a();
    sig_r[0] = 0;
    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private_attested(poll_id, 0, 111, 0, 4000000600, TEST_X_HI, TEST_X_LO, TEST_Y_HI, TEST_Y_LO, sig_r, sig_s),
    );
}

#[test]
unconstrained fn test_pool_voter_fallback_when_empty() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let payer = env.create_light_account();
    env.call_public(admin, HappyVote::at(contract_address).set_pool_payer(payer));
    let start = env.last_block_timestamp();
    // fallback voter (1), unfunded
    user_create_at(&mut env, contract_address, alice, start + 86400, 2, 1);
    let poll_id = PollId::new(Field::from(1));
    assert_eq(
        env.view_public(HappyVote::at(contract_address).quote_pool(poll_id, 50)),
        1,
    );
}

#[test]
unconstrained fn test_set_authoritative_admin_only() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    env.call_public(admin, HappyVote::at(contract_address).set_authoritative(alice, true));
    assert(env.view_public(HappyVote::at(contract_address).is_authoritative(alice)));
    env.call_public(admin, HappyVote::at(contract_address).set_authoritative(alice, false));
    assert(env.view_public(HappyVote::at(contract_address).is_authoritative(alice)) == false);
}

#[test(should_fail_with = "Only admin")]
unconstrained fn test_fail_authoritative_non_admin() {
    let (mut env, contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    env.call_public(alice, HappyVote::at(contract_address).set_authoritative(bob, true));
}


#[test(should_fail_with = "Only admin")]
unconstrained fn test_fail_set_hidden_author_book_non_admin() {
    let (mut env, contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    env.call_public(alice, HappyVote::at(contract_address).set_hidden_author_book(bob));
}

#[test(should_fail_with = "Book required")]
unconstrained fn test_fail_set_hidden_author_book_zero() {
    let (mut env, contract_address, admin) = utils::setup();
    env.call_public(admin, HappyVote::at(contract_address).set_hidden_author_book(AztecAddress::zero()));
}

#[test(should_fail_with = "Only hidden author book")]
unconstrained fn test_fail_hidden_init_from_account() {
    let (mut env, contract_address, admin) = utils::setup();
    let book = env.create_light_account();
    let alice = env.create_light_account();
    env.call_public(admin, HappyVote::at(contract_address).set_hidden_author_book(book));
    let day = (env.last_block_timestamp() / 86400) as Field;
    let start = env.last_block_timestamp();
    env.call_public(
        alice,
        HappyVote::at(contract_address).init_hidden_user_poll(
            2,
            2,
            0,
            7,
            false,
            0,
            start + 86400,
            0,
            0,
            0,
            3,
            4,
            1,
            day,
            9,
        ),
    );
}
