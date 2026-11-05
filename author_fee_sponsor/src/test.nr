use aztec::protocol::address::AztecAddress;
use aztec::test::helpers::test_environment::TestEnvironment;

use crate::AuthorFeeSponsor;

pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let initializer = AuthorFeeSponsor::interface().constructor(admin);
    let address = env.deploy("AuthorFeeSponsor").with_public_initializer(admin, initializer);
    (env, address, admin)
}

#[test]
unconstrained fn test_admin_is_stored() {
    let (env, address, admin) = setup();
    let stored = env.view_public(AuthorFeeSponsor::at(address).get_admin());
    assert(stored.eq(admin));
    assert(env.view_public(AuthorFeeSponsor::at(address).get_paused()) == false);
}

/// call_private runs in the app phase, after setup. Electing a fee payer there must fail.
/// The wallet calls sponsor_unconditionally during setup, which this harness cannot enter.
#[test(should_fail_with = "fee payer must be elected during the setup phase")]
unconstrained fn test_fail_sponsor_outside_setup() {
    let (mut env, address, _) = setup();
    let alice = env.create_light_account();
    env.call_private(alice, AuthorFeeSponsor::at(address).sponsor_unconditionally());
}

#[test]
unconstrained fn test_admin_can_pause() {
    let (mut env, address, admin) = setup();
    env.call_public(admin, AuthorFeeSponsor::at(address).set_paused(true));
    assert(env.view_public(AuthorFeeSponsor::at(address).get_paused()));
    env.call_public(admin, AuthorFeeSponsor::at(address).set_paused(false));
    assert(env.view_public(AuthorFeeSponsor::at(address).get_paused()) == false);
}

#[test(should_fail_with = "Only admin")]
unconstrained fn test_fail_pause_stranger() {
    let (mut env, address, _) = setup();
    let alice = env.create_light_account();
    env.call_public(alice, AuthorFeeSponsor::at(address).set_paused(true));
}

/// App-logic calls fail the setup-phase check before the pause assert runs.
/// set_paused is covered by test_admin_can_pause. assert_sponsoring reads that flag in setup.
#[test(should_fail_with = "fee payer must be elected during the setup phase")]
unconstrained fn test_fail_sponsor_when_paused_is_still_outside_setup() {
    let (mut env, address, admin) = setup();
    let alice = env.create_light_account();
    env.call_public(admin, AuthorFeeSponsor::at(address).set_paused(true));
    assert(env.view_public(AuthorFeeSponsor::at(address).get_paused()));
    env.call_private(alice, AuthorFeeSponsor::at(address).sponsor_unconditionally());
}

#[test(should_fail_with = "Admin must be non-zero")]
unconstrained fn test_fail_zero_admin() {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();
    let initializer = AuthorFeeSponsor::interface().constructor(AztecAddress::zero());
    let _address = env.deploy("AuthorFeeSponsor").with_public_initializer(admin, initializer);
}
