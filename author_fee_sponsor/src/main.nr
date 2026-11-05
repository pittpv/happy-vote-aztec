// AuthorFeeSponsor — fee payer for a private HappyVote author.
//
// The protocol publishes the fee payer. This contract calls set_as_fee_payer, so the
// published payer is this contract, not the author's account.
//
// Fee Juice can only be bridged in to this address. The protocol debits it when a
// sponsored transaction is included. There is no transfer that would move it to the author.
//
// sponsor_unconditionally matches SponsoredFeePaymentMethod. The pause check is enqueued
// before end_setup, so a paused sponsor fails in the non-revertible phase and is not included.
// The check does not take the author's address.

mod test;

use aztec::macros::aztec;

#[aztec]
pub contract AuthorFeeSponsor {
    use aztec::macros::{
        functions::{allow_phase_change, external, initializer, only_self, view},
        storage::storage,
    };
    use aztec::protocol::address::AztecAddress;
    use aztec::state_vars::{PublicMutable};

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        paused: PublicMutable<bool, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        assert(!admin.eq(AztecAddress::zero()), "Admin must be non-zero");
        self.storage.admin.write(admin);
        self.storage.paused.write(false);
    }

    /// Pays this transaction. The author's account is not an argument.
    /// The wallet calls this during the setup phase. An app-logic call cannot elect the fee payer.
    /// The pause check is enqueued before end_setup, so it runs in the non-revertible phase.
    #[external("private")]
    #[allow_phase_change]
    fn sponsor_unconditionally() {
        self.context.set_as_fee_payer();
        self.enqueue_self.assert_sponsoring();
        self.context.end_setup();
    }

    #[external("public")]
    #[only_self]
    fn assert_sponsoring() {
        assert(self.storage.paused.read() == false, "Author fee sponsor is paused");
    }

    #[external("public")]
    fn set_paused(paused: bool) {
        assert(self.storage.admin.read().eq(self.msg_sender()), "Only admin");
        self.storage.paused.write(paused);
    }

    #[external("public")]
    #[view]
    fn get_paused() -> bool {
        self.storage.paused.read()
    }

    #[external("public")]
    #[view]
    fn get_admin() -> AztecAddress {
        self.storage.admin.read()
    }
}
