use crate::test::utils;
use aztec::protocol::storage::map::derive_storage_slot_in_map;

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
}

#[test(should_fail_with = "Only admin can create polls")]
unconstrained fn test_fail_create_poll_non_admin() {
    let (mut env, contract_address, _) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(1));

    env.call_public(
        alice,
        HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 0, 1, false),
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
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0));

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

    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0));
    env.call_private(bob, HappyVote::at(contract_address).cast_vote_private(poll_id, 1, 0));

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

    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 1, 0));
}

#[test]
unconstrained fn test_cast_vote_open() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(7));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);

    env.call_private(alice, HappyVote::at(contract_address).cast_vote_open(poll_id, 1, 0));

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

    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_open(poll_id, 1, 0));
}

#[test]
unconstrained fn test_vote_two_polls() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_a = PollId::new(Field::from(10));
    let poll_b = PollId::new(Field::from(11));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_a);
    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_b);

    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_a, 0, 0));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_b, 1, 0));

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

#[test(should_fail_with = "Only admin can end polls")]
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
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0));
}

#[test(should_fail_with = "Poll requires private votes")]
unconstrained fn test_fail_open_on_private_only_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(13));

    // privacy_policy = 0 (private_only)
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 0, 0, 1, false));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_open(poll_id, 0, 0));
}

#[test(should_fail_with = "Poll requires open votes")]
unconstrained fn test_fail_private_on_public_only_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(14));

    // privacy_policy = 1 (public_only)
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 1, 0, 1, false));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0));
}

#[test(should_fail_with = "Invalid option")]
unconstrained fn test_fail_invalid_option_out_of_range() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(15));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    // options_count = 2 → option 2 is invalid
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 2, 0));
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
        HappyVote::at(contract_address).cast_vote_private(poll_id, Field::from(4294967296), 0),
    );
}

#[test]
unconstrained fn test_create_poll_zkpassport_eligibility() {
    let (mut env, contract_address, admin) = utils::setup();
    let poll_personhood = PollId::new(Field::from(20));
    let poll_gated = PollId::new(Field::from(21));

    // eligibility = 1 personhood, 2 gated
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_personhood, 2, 2, 1, 11, false));
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_gated, 3, 2, 2, 22, false));

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
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 3, 1, false));
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
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 1, 99, false));

    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 0, identity_a),
    );
    env.call_private(
        bob,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 1, identity_b),
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

    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 1, 99, false));

    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 0, shared_identity),
    );
    // Same ZKPassport UID, different Aztec account → reject
    env.call_private(
        bob,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 1, shared_identity),
    );
}

#[test(should_fail_with = "ZKPassport identity required")]
unconstrained fn test_fail_personhood_without_identity() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(32));

    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 1, 99, false));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0));
}

#[test(should_fail_with = "Identity not allowed for open polls")]
unconstrained fn test_fail_identity_on_open_poll() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(33));

    utils::create_happy_sad_poll(&mut env, contract_address, admin, poll_id);
    env.call_private(
        alice,
        HappyVote::at(contract_address).cast_vote_private(poll_id, 0, Field::from(55)),
    );
}

#[test]
unconstrained fn test_sealed_hides_tallies_until_end() {
    let (mut env, contract_address, admin) = utils::setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(40));

    // sealed = true
    env.call_public(admin, HappyVote::at(contract_address).create_poll(poll_id, 2, 2, 0, 1, true));
    env.call_private(alice, HappyVote::at(contract_address).cast_vote_private(poll_id, 0, 0));

    assert_eq(env.view_public(HappyVote::at(contract_address).get_sealed(poll_id)), true);
    // Hidden while active
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 0);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_total_votes(poll_id)), 0);

    env.call_public(admin, HappyVote::at(contract_address).end_poll(poll_id));
    assert_eq(env.view_public(HappyVote::at(contract_address).get_tally(poll_id, 0)), 1);
    assert_eq(env.view_public(HappyVote::at(contract_address).get_total_votes(poll_id)), 1);
}
