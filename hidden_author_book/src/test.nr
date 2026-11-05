use aztec::protocol::address::AztecAddress;
use aztec::test::helpers::test_environment::TestEnvironment;
use happy_vote_aztec::HappyVote;
use happy_vote_aztec::HappyVote::PollId;

use crate::HiddenAuthorBook;
use crate::author_commitment_of;

pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let happy_vote = env
        .deploy("../aztec/HappyVote")
        .with_public_initializer(admin, HappyVote::interface().constructor(admin));
    let book = env
        .deploy("HiddenAuthorBook")
        .with_public_initializer(admin, HiddenAuthorBook::interface().constructor(happy_vote));
    env.call_public(admin, HappyVote::at(happy_vote).set_hidden_author_book(book));
    (env, happy_vote, book, admin)
}

unconstrained fn user_create_hidden(
    env: &mut TestEnvironment,
    happy_vote: AztecAddress,
    book: AztecAddress,
    creator: AztecAddress,
    ends_at: u64,
    secret: Field,
    fee_mode: u8,
) {
    let expected = env.view_public(HappyVote::at(happy_vote).get_next_poll_id());
    let day = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(
        creator,
        HiddenAuthorBook::at(book).create_user_poll_private(
            2,
            2,
            0,
            7,
            false,
            0,
            ends_at,
            0,
            fee_mode,
            0,
            3,
            4,
            expected as Field,
            day,
            secret,
        ),
    );
}

#[test]
unconstrained fn test_book_points_at_happy_vote() {
    let (env, happy_vote, book, _) = setup();
    assert(env.view_public(HiddenAuthorBook::at(book).get_happy_vote()).eq(happy_vote));
}

#[test]
unconstrained fn test_hidden_author_create_hides_address() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let secret = Field::from(42);
    let start = env.last_block_timestamp();
    user_create_hidden(&mut env, happy_vote, book, alice, start + 86400, secret, 0);
    let poll_id = PollId::new(Field::from(1));
    assert(env.view_public(HappyVote::at(happy_vote).get_creator(poll_id)).eq(AztecAddress::zero()));
    assert_eq(
        env.view_public(HappyVote::at(happy_vote).get_tally(poll_id, 205)),
        author_commitment_of(secret, poll_id.value()),
    );
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_signing_pubkey_x(poll_id)), 3);
}

#[test]
unconstrained fn test_public_and_hidden_author_same_day() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    env.call_public(
        alice,
        HappyVote::at(happy_vote).create_user_poll(2, 2, 0, 7, false, 0, start + 86400, 0, 0, 0, 3, 4),
    );
    user_create_hidden(&mut env, happy_vote, book, alice, start + 86400, Field::from(9), 0);
    assert(env.view_public(HappyVote::at(happy_vote).get_creator(PollId::new(Field::from(1)))).eq(alice));
    assert(
        env.view_public(HappyVote::at(happy_vote).get_creator(PollId::new(Field::from(2)))).eq(AztecAddress::zero()),
    );
}

#[test]
unconstrained fn test_hidden_author_can_end_with_secret() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let secret = Field::from(11);
    let start = env.last_block_timestamp();
    user_create_hidden(&mut env, happy_vote, book, alice, start + 86400, secret, 0);
    let poll_id = PollId::new(Field::from(1));
    env.call_private(alice, HiddenAuthorBook::at(book).end_hidden_poll(poll_id.value(), secret, 0, 0, 0));
    assert(env.view_public(HappyVote::at(happy_vote).get_vote_ended(poll_id)));
}

#[test(should_fail_with = "Only creator")]
unconstrained fn test_fail_hidden_end_wrong_secret() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_hidden(&mut env, happy_vote, book, alice, start + 86400, Field::from(11), 0);
    env.call_private(
        alice,
        HiddenAuthorBook::at(book).end_hidden_poll(Field::from(1), Field::from(12), 0, 0, 0),
    );
}

#[test(should_fail_with = "Hidden poll not found")]
unconstrained fn test_fail_hidden_end_stranger() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let bob = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_hidden(&mut env, happy_vote, book, alice, start + 86400, Field::from(11), 0);
    env.call_private(bob, HiddenAuthorBook::at(book).end_hidden_poll(Field::from(1), Field::from(11), 0, 0, 0));
}

#[test(should_fail_with = "Only admin")]
unconstrained fn test_fail_public_end_of_hidden_poll() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_hidden(&mut env, happy_vote, book, alice, start + 86400, Field::from(11), 0);
    env.call_public(alice, HappyVote::at(happy_vote).end_poll(PollId::new(Field::from(1))));
}

#[test(should_fail_with = "duplicate siloed nullifier")]
unconstrained fn test_fail_hidden_create_twice_same_day() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_hidden(&mut env, happy_vote, book, alice, start + 86400, Field::from(1), 0);
    user_create_hidden(&mut env, happy_vote, book, alice, start + 86400, Field::from(2), 0);
}

#[test(should_fail_with = "Too many open polls")]
unconstrained fn test_fail_fourth_open_hidden_poll() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let t0 = env.last_block_timestamp();
    let horizon = t0 + 86400 * 10;
    user_create_hidden(&mut env, happy_vote, book, alice, horizon, Field::from(1), 0);
    env.mine_block_at(t0 + 86400);
    user_create_hidden(&mut env, happy_vote, book, alice, horizon, Field::from(2), 0);
    env.mine_block_at(t0 + 86400 * 2);
    user_create_hidden(&mut env, happy_vote, book, alice, horizon, Field::from(3), 0);
    env.mine_block_at(t0 + 86400 * 3);
    user_create_hidden(&mut env, happy_vote, book, alice, horizon, Field::from(4), 0);
}

#[test]
unconstrained fn test_hidden_end_frees_open_slot() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let t0 = env.last_block_timestamp();
    let horizon = t0 + 86400 * 10;
    user_create_hidden(&mut env, happy_vote, book, alice, horizon, Field::from(1), 0);
    env.mine_block_at(t0 + 86400);
    user_create_hidden(&mut env, happy_vote, book, alice, horizon, Field::from(2), 0);
    env.mine_block_at(t0 + 86400 * 2);
    user_create_hidden(&mut env, happy_vote, book, alice, horizon, Field::from(3), 0);
    env.call_private(alice, HiddenAuthorBook::at(book).end_hidden_poll(Field::from(1), Field::from(1), 0, 0, 0));
    env.mine_block_at(t0 + 86400 * 3);
    user_create_hidden(&mut env, happy_vote, book, alice, horizon, Field::from(4), 0);
    assert(
        env.view_public(HappyVote::at(happy_vote).get_creator(PollId::new(Field::from(4)))).eq(AztecAddress::zero()),
    );
}

#[test]
unconstrained fn test_hidden_pool_credit_with_secret() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let secret = Field::from(8);
    let start = env.last_block_timestamp();
    user_create_hidden(&mut env, happy_vote, book, alice, start + 86400, secret, 2);
    let poll_id = PollId::new(Field::from(1));
    env.call_private(alice, HiddenAuthorBook::at(book).end_hidden_poll(poll_id.value(), secret, 1, 2, 200));
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_pool_remaining(poll_id)), 2);
    assert_eq(env.view_public(HappyVote::at(happy_vote).get_pool_juice(poll_id)), 200);
}

#[test(should_fail_with = "Only creator")]
unconstrained fn test_fail_public_fund_of_hidden_poll() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    user_create_hidden(&mut env, happy_vote, book, alice, start + 86400, Field::from(8), 2);
    env.call_public(alice, HappyVote::at(happy_vote).fund_pool(PollId::new(Field::from(1)), 1, 10));
}

#[test(should_fail_with = "Poll id changed")]
unconstrained fn test_fail_hidden_create_stale_id() {
    let (mut env, happy_vote, book, _) = setup();
    let alice = env.create_light_account();
    let start = env.last_block_timestamp();
    let day = (env.last_block_timestamp() / 86400) as Field;
    env.call_private(
        alice,
        HiddenAuthorBook::at(book).create_user_poll_private(
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
            99,
            day,
            5,
        ),
    );
}

#[test(should_fail_with = "HappyVote required")]
unconstrained fn test_fail_zero_happy_vote() {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let _book = env
        .deploy("HiddenAuthorBook")
        .with_public_initializer(admin, HiddenAuthorBook::interface().constructor(AztecAddress::zero()));
}
