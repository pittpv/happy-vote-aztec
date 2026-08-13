// HappyVote — multi-poll voting on Aztec
//
// Iteration 1:
// - Admin creates polls (any topic / N options)
// - Private ballot + public tally (default)
// - Optional open (public) ballot when poll policy allows
// - One vote per account per poll via SingleUseClaim nullifiers
// - ZKPassport polls: one vote per uniqueIdentifier via public identity claim
//
// Pattern: Aztec private_voting_contract (v5.1.0) — private claim + public tally.

mod test;

use aztec::macros::aztec;

#[aztec]
pub contract HappyVote {
    use aztec::macros::{functions::{external, initializer, internal, only_self, view}, storage::storage};
    use aztec::protocol::{address::AztecAddress, traits::{Deserialize, Serialize, ToField}};
    use aztec::state_vars::{Map, Owned, PublicImmutable, PublicMutable, SingleUseClaim};

    global MAX_OPTIONS: u32 = 32;

    global PRIVACY_PRIVATE_ONLY: u8 = 0;
    global PRIVACY_PUBLIC_ONLY: u8 = 1;
    global PRIVACY_VOTER_CHOICE: u8 = 2;

    global ELIGIBILITY_OPEN: u8 = 0;
    /// ZKPassport personhood (unique person / anti-sybil); details off-chain via metadata_hash.
    global ELIGIBILITY_PERSONHOOD: u8 = 1;
    /// ZKPassport gated: age / nationality / sanctions / facematch predicates in metadata.
    global ELIGIBILITY_GATED: u8 = 2;

    #[derive(Serialize, Deserialize)]
    pub struct PollId {
        id: Field,
    }

    impl PollId {
        pub fn new(id: Field) -> Self {
            Self { id }
        }
    }

    impl ToField for PollId {
        fn to_field(self) -> Field {
            self.id
        }
    }

    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        options_count: Map<PollId, PublicMutable<u32, Context>, Context>,
        privacy_policy: Map<PollId, PublicMutable<u8, Context>, Context>,
        eligibility_mode: Map<PollId, PublicMutable<u8, Context>, Context>,
        metadata_hash: Map<PollId, PublicMutable<Field, Context>, Context>,
        tally: Map<PollId, Map<Field, PublicMutable<Field, Context>, Context>, Context>,
        total_votes: Map<PollId, PublicMutable<Field, Context>, Context>,
        vote_ended: Map<PollId, PublicMutable<bool, Context>, Context>,
        active_at_block: Map<PollId, PublicImmutable<u32, Context>, Context>,
        vote_claims: Map<PollId, Owned<SingleUseClaim<Context>, Context>, Context>,
        /// Open ballot value = option_id + 1 (0 means none).
        open_ballots: Map<PollId, Map<AztecAddress, PublicMutable<Field, Context>, Context>, Context>,
        /// ZKPassport uniqueIdentifier commitment claimed per poll (anti double-vote across accounts).
        identity_claims: Map<PollId, Map<Field, PublicMutable<bool, Context>, Context>, Context>,
        /// When true, get_tally / get_total_votes return 0 until the poll is ended.
        sealed: Map<PollId, PublicMutable<bool, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        assert(!admin.eq(AztecAddress::zero()), "Admin must be non-zero");
        self.storage.admin.write(admin);
    }

    #[external("public")]
    fn create_poll(
        poll_id: PollId,
        options_count: u32,
        privacy_policy: u8,
        eligibility_mode: u8,
        metadata_hash: Field,
        sealed: bool,
    ) {
        assert(self.storage.admin.read().eq(self.msg_sender()), "Only admin can create polls");
        assert(options_count >= 2, "Need at least 2 options");
        assert(options_count <= MAX_OPTIONS, "Too many options");
        assert(privacy_policy <= PRIVACY_VOTER_CHOICE, "Invalid privacy policy");
        assert(eligibility_mode <= ELIGIBILITY_GATED, "Unsupported eligibility mode");
        assert(self.storage.options_count.at(poll_id).read() == 0, "Poll already exists");

        self.storage.options_count.at(poll_id).write(options_count);
        self.storage.privacy_policy.at(poll_id).write(privacy_policy);
        self.storage.eligibility_mode.at(poll_id).write(eligibility_mode);
        self.storage.metadata_hash.at(poll_id).write(metadata_hash);
        self.storage.sealed.at(poll_id).write(sealed);
        self.storage.vote_ended.at(poll_id).write(false);
        self.storage.total_votes.at(poll_id).write(0);
        self.storage.active_at_block.at(poll_id).initialize(self.context.block_number());
    }

    /// Private ballot — voter address stays hidden; option_id is public in the
    /// enqueued tally update (live public tallies). Same nullifier domain as open votes.
    /// `identity_commitment`: 0 for open eligibility; ZKPassport UID field otherwise.
    #[external("private")]
    fn cast_vote_private(poll_id: PollId, option_id: Field, identity_commitment: Field) {
        self.storage.vote_claims.at(poll_id).at(self.msg_sender()).claim();
        self.enqueue_self.add_to_tally_public(poll_id, option_id, identity_commitment);
    }

    /// Open ballot — voter + choice recorded publicly.
    /// Uses the same claim domain as private votes (no double voting across modes).
    #[external("private")]
    fn cast_vote_open(poll_id: PollId, option_id: Field, identity_commitment: Field) {
        let voter = self.msg_sender();
        self.storage.vote_claims.at(poll_id).at(voter).claim();
        self.enqueue_self.record_open_vote_public(poll_id, voter, option_id, identity_commitment);
    }

    #[external("public")]
    #[only_self]
    fn add_to_tally_public(poll_id: PollId, option_id: Field, identity_commitment: Field) {
        self.internal.assert_vote_allowed(poll_id, identity_commitment);
        assert(
            self.storage.privacy_policy.at(poll_id).read() != PRIVACY_PUBLIC_ONLY,
            "Poll requires open votes",
        );

        // Reject Field→u32 truncation (e.g. 2^32 + k) that would write a different map key.
        let truncated = option_id as u32;
        assert(truncated < self.storage.options_count.at(poll_id).read(), "Invalid option");
        let option = truncated as Field;
        assert(option_id == option, "Invalid option");

        let new_tally = self.storage.tally.at(poll_id).at(option).read() + 1;
        self.storage.tally.at(poll_id).at(option).write(new_tally);
        let total = self.storage.total_votes.at(poll_id).read() + 1;
        self.storage.total_votes.at(poll_id).write(total);
    }

    #[external("public")]
    #[only_self]
    fn record_open_vote_public(
        poll_id: PollId,
        voter: AztecAddress,
        option_id: Field,
        identity_commitment: Field,
    ) {
        self.internal.assert_vote_allowed(poll_id, identity_commitment);
        assert(
            self.storage.privacy_policy.at(poll_id).read() != PRIVACY_PRIVATE_ONLY,
            "Poll requires private votes",
        );

        let truncated = option_id as u32;
        assert(truncated < self.storage.options_count.at(poll_id).read(), "Invalid option");
        let option = truncated as Field;
        assert(option_id == option, "Invalid option");

        self.storage.open_ballots.at(poll_id).at(voter).write(option + 1);
        let new_tally = self.storage.tally.at(poll_id).at(option).read() + 1;
        self.storage.tally.at(poll_id).at(option).write(new_tally);
        let total = self.storage.total_votes.at(poll_id).read() + 1;
        self.storage.total_votes.at(poll_id).write(total);
    }

    /// Enforce eligibility mode + claim ZKPassport identity when required.
    #[internal("public")]
    fn assert_vote_allowed(poll_id: PollId, identity_commitment: Field) {
        assert(self.storage.options_count.at(poll_id).read() > 0, "Poll does not exist");
        assert(
            self.storage.active_at_block.at(poll_id).read() <= self.context.block_number(),
            "Poll not active yet",
        );
        assert(self.storage.vote_ended.at(poll_id).read() == false, "Vote has ended");

        let mode = self.storage.eligibility_mode.at(poll_id).read();
        if mode == ELIGIBILITY_OPEN {
            assert(identity_commitment == 0, "Identity not allowed for open polls");
        } else {
            // PERSONHOOD (1) or GATED (2) — create_poll already bounds the mode.
            let _personhood = ELIGIBILITY_PERSONHOOD;
            let _gated = ELIGIBILITY_GATED;
            assert(mode >= _personhood, "ZKPassport eligibility required");
            assert(mode <= _gated, "Unsupported eligibility mode");
            assert(identity_commitment != 0, "ZKPassport identity required");
            assert(
                self.storage.identity_claims.at(poll_id).at(identity_commitment).read() == false,
                "Identity already voted",
            );
            self.storage.identity_claims.at(poll_id).at(identity_commitment).write(true);
        }
    }

    #[external("public")]
    fn end_poll(poll_id: PollId) {
        assert(self.storage.admin.read().eq(self.msg_sender()), "Only admin can end polls");
        assert(self.storage.options_count.at(poll_id).read() > 0, "Poll does not exist");
        self.storage.vote_ended.at(poll_id).write(true);
    }

    #[external("public")]
    #[view]
    fn get_tally(poll_id: PollId, option_id: Field) -> Field {
        if self.internal.tallies_hidden(poll_id) {
            0
        } else {
            self.storage.tally.at(poll_id).at(option_id).read()
        }
    }

    #[external("public")]
    #[view]
    fn get_total_votes(poll_id: PollId) -> Field {
        if self.internal.tallies_hidden(poll_id) {
            0
        } else {
            self.storage.total_votes.at(poll_id).read()
        }
    }

    #[external("public")]
    #[view]
    fn get_options_count(poll_id: PollId) -> u32 {
        self.storage.options_count.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_privacy_policy(poll_id: PollId) -> u8 {
        self.storage.privacy_policy.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_eligibility_mode(poll_id: PollId) -> u8 {
        self.storage.eligibility_mode.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_metadata_hash(poll_id: PollId) -> Field {
        self.storage.metadata_hash.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_vote_ended(poll_id: PollId) -> bool {
        self.storage.vote_ended.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_open_ballot(poll_id: PollId, voter: AztecAddress) -> Field {
        self.storage.open_ballots.at(poll_id).at(voter).read()
    }

    #[external("public")]
    #[view]
    fn has_identity_voted(poll_id: PollId, identity_commitment: Field) -> bool {
        self.storage.identity_claims.at(poll_id).at(identity_commitment).read()
    }

    #[external("public")]
    #[view]
    fn get_sealed(poll_id: PollId) -> bool {
        self.storage.sealed.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_admin() -> AztecAddress {
        self.storage.admin.read()
    }

    #[internal("public")]
    fn tallies_hidden(poll_id: PollId) -> bool {
        if self.storage.sealed.at(poll_id).read() {
            self.storage.vote_ended.at(poll_id).read() == false
        } else {
            false
        }
    }
}
