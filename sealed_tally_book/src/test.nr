use aztec::protocol::address::AztecAddress;
use aztec::protocol::traits::ToField;
use aztec::test::helpers::test_environment::TestEnvironment;
use happy_vote_aztec::HappyVote;
use happy_vote_aztec::HappyVote::PollId;

use crate::SealedTallyBook;
use crate::elgamal::{generator, GENERATOR_X, GENERATOR_Y};

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

unconstrained fn open_sealed(
    env: &mut TestEnvironment,
    happy_vote: AztecAddress,
    book: AztecAddress,
    admin: AztecAddress,
    poll_id: PollId,
    ends_at: u64,
    publish_at: u64,
) {
    env.call_public(
        admin,
        HappyVote::at(happy_vote).create_poll(poll_id, 2, 2, 0, 1, true, 0, ends_at, 0, publish_at),
    );
    env.call_public(
        admin,
        SealedTallyBook::at(book).store_key_admin(poll_id.to_field(), GENERATOR_X, GENERATOR_Y),
    );
}

#[test]
unconstrained fn test_sealed_vote_hides_option_until_publish() {
    let (mut env, happy_vote, book, admin) = setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(40));
    let ends_at = env.last_block_timestamp() + 1000;
    open_sealed(&mut env, happy_vote, book, admin, poll_id, ends_at, ends_at + 1000);
    let mut randomness: [Field; 8] = [0; 8];
    randomness[0] = 1;
    randomness[1] = 2;
    env.call_private(
        alice,
        SealedTallyBook::at(book).cast(
            40,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            [0; 32],
            [0; 32],
            0,
            2,
            admin,
            randomness,
            [0; 32],
            GENERATOR_X,
            GENERATOR_Y,
        ),
    );

    assert_eq(env.view_public(HappyVote::at(happy_vote).get_tally(poll_id, 0)), 0);
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_total_votes(poll_id)), 0);
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_sealed_ballots(poll_id)), 1);
    assert(generator().x == GENERATOR_X);

    env.mine_block_at(ends_at + 1000);
    let points = env.view_public(SealedTallyBook::at(book).get_ciphertext(40));
    let mut counts: [Field; 8] = [0; 8];
    counts[0] = 1;
    env.call_private(
        alice,
        SealedTallyBook::at(book).publish(40, 1, counts, points, admin, GENERATOR_X, GENERATOR_Y),
    );
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_tally(poll_id, 0)), 1);
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_tally(poll_id, 1)), 0);
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_total_votes(poll_id)), 1);
}

#[test(should_fail_with = "Results are not published yet")]
unconstrained fn test_fail_publish_before_time() {
    let (mut env, happy_vote, book, admin) = setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(55));
    let ends_at = env.last_block_timestamp() + 200;
    open_sealed(&mut env, happy_vote, book, admin, poll_id, ends_at, ends_at + 500);
    let mut randomness: [Field; 8] = [0; 8];
    randomness[0] = 1;
    randomness[1] = 2;
    env.call_private(
        alice,
        SealedTallyBook::at(book).cast(
            55, 0, 0, 0, 0, 0, 0, 0, 0, [0; 32], [0; 32], 0, 2, admin, randomness, [0; 32], GENERATOR_X, GENERATOR_Y,
        ),
    );
    env.mine_block_at(ends_at);
    let points = env.view_public(SealedTallyBook::at(book).get_ciphertext(55));
    let mut counts: [Field; 8] = [0; 8];
    counts[0] = 1;
    env.call_private(
        alice,
        SealedTallyBook::at(book).publish(55, 1, counts, points, admin, GENERATOR_X, GENERATOR_Y),
    );
}

#[test(should_fail_with = "Sealed ballot uses the tally book")]
unconstrained fn test_fail_direct_vote_on_sealed_poll() {
    let (mut env, happy_vote, book, admin) = setup();
    let alice = env.create_light_account();
    let poll_id = PollId::new(Field::from(41));
    let ends_at = env.last_block_timestamp() + 1000;
    open_sealed(&mut env, happy_vote, book, admin, poll_id, ends_at, ends_at + 1000);
    env.call_private(alice, HappyVote::at(happy_vote).cast_vote_private(poll_id, 0, 0, 0));
}

#[test(should_fail_with = "End is required")]
unconstrained fn test_fail_sealed_without_end() {
    let (mut env, happy_vote, _, admin) = setup();
    let poll_id = PollId::new(Field::from(42));
    env.call_public(admin, HappyVote::at(happy_vote).create_poll(poll_id, 2, 2, 0, 1, true, 0, 0, 0, 0));
}
