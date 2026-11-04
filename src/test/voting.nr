use crate::test::utils;
use aztec::protocol::{address::AztecAddress, storage::map::derive_storage_slot_in_map};
use aztec::test::helpers::test_environment::TestEnvironment;

use crate::HappyVote;
use crate::HappyVote::PollId;

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
unconstrained fn test_zkpassport_identity_vote() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    let poll_id = PollId::new(Field::from(30));
    let identity_a = Field::from(111);
    let identity_b = Field::from(222);

    // eligibility personhood = 1
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 1, 99, false, 0, 0, 0));

    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 0, identity_a, 0),
    );
    env.call_private(
        bob,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 1, identity_b, 0),
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

    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 0, shared_identity, 0),
    );
    // Same ZKPassport UID, different Aztec account → reject
    env.call_private(
        bob,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 1, shared_identity, 0),
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

#[test]
unconstrained fn test_sealed_hides_tallies_until_end() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(40));

    // sealed = true
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 0, 1, true, 0, 0, 0));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));

    assert_eq(env.view_public(HappyVote::at(contract_address).get_sealed(poll_id)), true);
    // Hidden while active
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 0);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_total_votes(poll_id)), 0);

    env.call_public(admin, HappyVote::at(contract_address).end_poll(poll_id));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 1);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_total_votes(poll_id)), 1);
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

#[test]
unconstrained fn test_sealed_reveals_after_ends_at() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(55));
    let ends_at = env.last_block_timestamp() + 200;

    utils::create_poll(&mut env, contract_address, admin, poll_id, 2, 2, 0, 1, true, 0, ends_at, 0);
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0, 0));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 0);

    env.mine_block_at(ends_at);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 1);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_total_votes(poll_id)), 1);
    assert_eq(env.view_public(HappyVote::at(contract_address).is_voting_open(poll_id)), false);
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
    let period = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 0, identity, period),
    );
    assert_eq(
        env.view_public(HappyVote::at(contract_address).has_identity_voted(poll_id, identity)),
        true,
    );

    env.mine_block_at(env.last_block_timestamp() + 86400);
    let next_period = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(
        bob,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 1, identity, next_period),
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
    let period = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 0, identity, period),
    );
    env.call_private(
        bob,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 1, identity, period),
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
    env.call_public(alice, HappyVote::at(contract_address).fund_pool(poll_id, 2, 200));
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
