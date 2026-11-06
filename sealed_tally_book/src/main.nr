// SealedTallyBook — private ballots for a sealed HappyVote poll.
//
// HappyVote cannot store another private note: it is already at the Noir type-complexity cap.
// This contract is the only private entry for a sealed ballot. The chosen option is written
// into a note owned by the poll's tally recipient. The public call records that a ballot was
// accepted and does not receive the option.
//
// After the poll closes, the recipient publishes the notes. HappyVote's per-option views stay
// at zero until every accepted ballot is included. The recipient can read the notes before that
// transaction. Everyone else cannot.

mod ballot_note;
mod test;

use aztec::macros::aztec;

#[aztec]
pub contract SealedTallyBook {
    use aztec::macros::{functions::{external, initializer, view}, storage::storage};
    use aztec::messages::delivery::MessageDelivery;
    use aztec::note::note_getter_options::NoteGetterOptions;
    use aztec::note::note_interface::NoteProperties;
    use aztec::protocol::address::AztecAddress;
    use aztec::state_vars::{Map, Owned, PrivateSet, PublicImmutable, SingleUseClaim};
    use aztec::utils::comparison::Comparator;
    use crate::ballot_note::BallotNote;
    use happy_vote_aztec::HappyVote;

    global PERIOD_KEY_SHIFT: Field = 4294967296;

    #[storage]
    struct Storage<Context> {
        happy_vote: PublicImmutable<AztecAddress, Context>,
        /// One claim per account per poll period. Separate from HappyVote's unsealed claims.
        vote_claims: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
        /// All sealed ballots for the tally recipient. Filtered by poll id when publishing.
        ballots: Owned<PrivateSet<BallotNote, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(happy_vote: AztecAddress) {
        assert(happy_vote.eq(AztecAddress::zero()) == false, "HappyVote required");
        self.storage.happy_vote.initialize(happy_vote);
    }

    /// Private sealed ballot. `option_id` is not an argument of the HappyVote call.
    #[external("private")]
    fn cast(
        poll_id: Field,
        option_id: Field,
        identity_commitment: Field,
        vote_period: Field,
        expiry: u64,
        x_hi: Field,
        x_lo: Field,
        y_hi: Field,
        y_lo: Field,
        sig_r: [u8; 32],
        sig_s: [u8; 32],
        eligibility_mode: u8,
        options_count: u32,
        recipient: AztecAddress,
    ) {
        let happy = self.storage.happy_vote.read();
        let poll = HappyVote::PollId::new(poll_id);
        let option_u32 = option_id as u32;
        assert(option_id == (option_u32 as Field), "Invalid option");
        assert(option_u32 < options_count, "Invalid option");
        assert(recipient.eq(AztecAddress::zero()) == false, "Tally recipient required");
        if eligibility_mode != 0 {
            happy_vote_aztec::assert_zk_attestation(
                x_hi as u128,
                x_lo as u128,
                y_hi as u128,
                y_lo as u128,
                poll_id,
                identity_commitment,
                vote_period,
                expiry,
                sig_r,
                sig_s,
            );
        }

        self.storage.vote_claims.at(poll_id + vote_period * PERIOD_KEY_SHIFT).at(self.msg_sender()).claim();
        self.storage
            .ballots
            .at(recipient)
            .insert(BallotNote { poll_id, option_id })
            .deliver(MessageDelivery::onchain_unconstrained());
        self.enqueue(HappyVote::at(happy).record_sealed_participation(
            poll,
            identity_commitment,
            vote_period,
            expiry,
            x_hi,
            x_lo,
            y_hi,
            y_lo,
            sig_r,
            sig_s,
            eligibility_mode,
            options_count,
            recipient,
        ));
    }

    /// Publish up to one page of this poll's notes. Repeat until the public count is included.
    #[external("private")]
    fn reveal(poll_id: Field) {
        let happy = self.storage.happy_vote.read();
        let poll = HappyVote::PollId::new(poll_id);
        let recipient = self.msg_sender();
        let mut options = NoteGetterOptions::new().set_limit(16);
        let notes = self.storage.ballots.at(recipient).pop_notes(
            options.select(BallotNote::properties().poll_id, Comparator.EQ, poll_id),
        );
        assert(notes.len() > 0, "Sealed ballots missing");
        let mut counts: [Field; 32] = [0; 32];
        for i in 0..16 {
            if i < notes.len() {
                let note = notes.get(i);
                assert(note.poll_id == poll_id, "Wrong poll");
                let index = note.option_id as u32;
                assert(note.option_id == (index as Field), "Invalid option");
                assert(index < 32, "Invalid option");
                counts[index] = counts[index] + 1;
            }
        }
        self.enqueue(HappyVote::at(happy).publish_sealed_tally(poll, counts, notes.len() as u64, recipient));
    }

    #[external("public")]
    #[view]
    fn get_happy_vote() -> AztecAddress {
        self.storage.happy_vote.read()
    }
}
