use aztec::protocol::address::AztecAddress;
use aztec::test::helpers::test_environment::TestEnvironment;
use happy_vote_aztec::HappyVote;
use happy_vote_aztec::HappyVote::PollId;

use crate::SealedTallyBook;

pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let happy_vote = env
        .deploy("../aztec/HappyVote")
        .with_public_initializer(admin, HappyVote::interface().constructor(admin));
    let book = env
        .deploy("SealedTallyBook")
        .with_public_initializer(admin, SealedTallyBook::interface().constructor(happy_vote));
    env.call_public(admin, HappyVote::at(happy_vote).set_sealed_tally_book(book));
    (env, happy_vote, book, admin)
}

#[test]
unconstrained fn test_sealed_vote_hides_option_until_reveal() {
    let (mut env, happy_vote, book, admin) = setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(40));
    env.call_public(admin, HappyVote::at(happy_vote).create_poll(poll_id, 2, 2, 0, 1, true, 0, 0, 0));
    env.call_private(
        alice,
        SealedTallyBook::at(book).cast(40, 0, 0, 0, 0, 0, 0, 0, 0, [0; 32], [0; 32], 0, 2, admin),
    );

    assert_eq(env.view_public(HappyVote::at(happy_vote).get_tally(poll_id, 0)), 0);
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_total_votes(poll_id)), 0);
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_sealed_ballots(poll_id)), 1);

    env.call_public(admin, HappyVote::at(happy_vote).end_poll(poll_id));
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_tally(poll_id, 0)), 0);

    env.call_private(admin, SealedTallyBook::at(book).reveal(40));
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_tally(poll_id, 0)), 1);
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_tally(poll_id, 1)), 0);
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_total_votes(poll_id)), 1);
}

#[test]
unconstrained fn test_sealed_reveal_after_ends_at() {
    let (mut env, happy_vote, book, admin) = setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(55));
    let ends_at = env.last_block_timestamp() + 200;
    env.call_public(
        admin,
        HappyVote::at(happy_vote).create_poll(poll_id, 2, 2, 0, 1, true, 0, ends_at, 0),
    );
    env.call_private(
        alice,
        SealedTallyBook::at(book).cast(55, 0, 0, 0, 0, 0, 0, 0, 0, [0; 32], [0; 32], 0, 2, admin),
    );
    env.mine_block_at(ends_at);
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_tally(poll_id, 0)), 0);
    assert_eq(env.view_public(HappyVote::at(happy_vote).is_voting_open(poll_id)), false);
    env.call_private(admin, SealedTallyBook::at(book).reveal(55));
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_tally(poll_id, 0)), 1);
}

#[test(should_fail_with = "Sealed ballot uses the tally book")]
unconstrained fn test_fail_direct_vote_on_sealed_poll() {
    let (mut env, happy_vote, _, admin) = setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(41));
    env.call_public(admin, HappyVote::at(happy_vote).create_poll(poll_id, 2, 2, 0, 1, true, 0, 0, 0));
    env.call_private(alice, HappyVote::at(happy_vote).cast_vote_private(poll_id, 0, 0, 0));
}

#[test(should_fail_with = "duplicate siloed nullifier")]
unconstrained fn test_fail_second_sealed_vote_same_account() {
    let (mut env, happy_vote, book, admin) = setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(42));
    env.call_public(admin, HappyVote::at(happy_vote).create_poll(poll_id, 2, 2, 0, 1, true, 0, 0, 0));
    env.call_private(alice, SealedTallyBook::at(book).cast(42, 0, 0, 0, 0, 0, 0, 0, 0, [0; 32], [0; 32], 0, 2, admin));
    env.call_private(alice, SealedTallyBook::at(book).cast(42, 1, 0, 0, 0, 0, 0, 0, 0, [0; 32], [0; 32], 0, 2, admin));
}

#[test(should_fail_with = "Sealed ballots missing")]
unconstrained fn test_fail_stranger_reveal() {
    let (mut env, happy_vote, book, admin) = setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(43));
    env.call_public(admin, HappyVote::at(happy_vote).create_poll(poll_id, 2, 2, 0, 1, true, 0, 0, 0));
    env.call_private(alice, SealedTallyBook::at(book).cast(43, 0, 0, 0, 0, 0, 0, 0, 0, [0; 32], [0; 32], 0, 2, admin));
    env.call_public(admin, HappyVote::at(happy_vote).end_poll(poll_id));
    env.call_private(alice, SealedTallyBook::at(book).reveal(43));
}
