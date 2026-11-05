// HiddenAuthorBook — private note for a HappyVote author.
//
// HappyVote cannot store this note: another private field pushes it over the Noir
// type-complexity cap. This contract is the only private entry for a hidden author.
// It enqueues HappyVote, so the published caller is this contract, not the account.
// The secret is a private argument and is stored only in the note.
//
// The fee payer is chosen by the wallet. HappyVote does not pay this transaction.
// Testnet uses the canonical Sponsored FPC. Mainnet uses AuthorFeeSponsor.
// AuthorFeeSponsor is not deployed. A Testnet address for this book is published
// only after that deployment, in the public address doc.

mod hidden_author_note;
mod test;

use aztec::macros::aztec;
use protocol_types::hash::poseidon2_hash;

/// Same domain as HappyVote::author_commitment_of. Distinct from the public daily claim (7)
/// and the authoritative mark (8).
pub fn author_commitment_of(secret: Field, poll_id: Field) -> Field {
    poseidon2_hash([secret, poll_id, 9])
}

#[aztec]
pub contract HiddenAuthorBook {
    use aztec::keys::getters::get_public_keys;
    use aztec::macros::{functions::{external, initializer, view}, storage::storage};
    use aztec::messages::delivery::MessageDelivery;
    use protocol_types::{
        address::AztecAddress,
        hash::poseidon2_hash_with_separator,
        traits::{Deserialize, FromField, Serialize, ToField},
    };
    use aztec::state_vars::{Owned, PrivateMutable, PublicImmutable};
    use crate::hidden_author_note::HiddenAuthorNote;
    use happy_vote_aztec::HappyVote;

    #[storage]
    struct Storage<Context> {
        happy_vote: PublicImmutable<AztecAddress, Context>,
        /// Up to three open hidden-author polls. The secret stays in the note.
        hidden_author: Owned<PrivateMutable<HiddenAuthorNote, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(happy_vote: AztecAddress) {
        assert(happy_vote.eq(AztecAddress::zero()) == false, "HappyVote required");
        self.storage.happy_vote.initialize(happy_vote);
    }

    /// Hidden author. The sender's address is not an argument of the HappyVote call and is not stored there.
    /// `expected_id` must be HappyVote's current next poll id. `claimed_day` must be the block's UTC day.
    #[external("private")]
    fn create_user_poll_private(
        options_count: u32,
        privacy_policy: u8,
        eligibility_mode: u8,
        metadata_hash: Field,
        sealed: bool,
        starts_at: u64,
        ends_at: u64,
        vote_frequency: u8,
        fee_mode: u8,
        fee_fallback: u8,
        signing_pubkey_x: Field,
        signing_pubkey_y: Field,
        expected_id: Field,
        claimed_day: Field,
        creator_secret: Field,
    ) {
        assert(creator_secret != 0, "Creator secret required");
        assert(expected_id != 0, "Poll id required");
        let sender = self.msg_sender();
        let commitment = crate::author_commitment_of(creator_secret, expected_id);
        self.storage.hidden_author.at(sender).initialize_or_replace(|current| {
            let note = if current.is_none() {
                HiddenAuthorNote::empty()
            } else {
                current.unwrap()
            };
            note.with_poll(expected_id, creator_secret)
        }).deliver(MessageDelivery::onchain_unconstrained());
        // One create per account per UTC day. The nullifier is siloed by the account's
        // nullifier-hiding key, so the address is not published.
        let owner_nhk_app = self.context.request_nhk_app(get_public_keys(sender).npk_m_hash);
        let create_nullifier = poseidon2_hash_with_separator(
            [owner_nhk_app, claimed_day, sender.to_field()],
            1900000007,
        );
        self.context.push_nullifier_unsafe(create_nullifier);
        self.enqueue(HappyVote::at(self.storage.happy_vote.read()).init_hidden_user_poll(
            options_count,
            privacy_policy,
            eligibility_mode,
            metadata_hash,
            sealed,
            starts_at,
            ends_at,
            vote_frequency,
            fee_mode,
            fee_fallback,
            signing_pubkey_x,
            signing_pubkey_y,
            expected_id,
            claimed_day,
            commitment,
        ));
    }

    /// Proves the note secret, then asks HappyVote to close the poll or credit its pool.
    /// action 0 frees the note slot and closes the poll. action 1 credits the pool and keeps the slot.
    #[external("private")]
    fn end_hidden_poll(poll_id: Field, creator_secret: Field, action: u8, count: u64, juice: u64) {
        let commitment = crate::author_commitment_of(creator_secret, poll_id);
        assert(commitment != 0, "Author commitment required");
        if action == 1 {
            assert(count > (0 as u64), "Pool count required");
            assert(juice > (0 as u64), "Pool juice required");
        } else if action != 0 {
            assert(false, "Unknown hidden author action");
        }
        let sender = self.msg_sender();
        self.storage.hidden_author.at(sender).initialize_or_replace(|current| {
            assert(current.is_some(), "Hidden poll not found");
            let note = current.unwrap();
            assert(note.secret_for(poll_id) == creator_secret, "Only creator");
            if action == 0 {
                note.without_poll(poll_id)
            } else {
                note
            }
        }).deliver(MessageDelivery::onchain_unconstrained());
        self.enqueue(HappyVote::at(self.storage.happy_vote.read()).finish_hidden_poll(
            HappyVote::PollId::new(poll_id),
            commitment,
            action,
            count,
            juice,
        ));
    }

    /// Local note for the connected account. Empty slots are zero. Does not publish the address.
    #[external("utility")]
    unconstrained fn get_hidden_author_note(owner: AztecAddress) -> HiddenAuthorNote {
        if self.storage.hidden_author.at(owner).is_initialized() {
            self.storage.hidden_author.at(owner).view_note()
        } else {
            HiddenAuthorNote::empty()
        }
    }

    #[external("public")]
    #[view]
    fn get_happy_vote() -> AztecAddress {
        self.storage.happy_vote.read()
    }
}
