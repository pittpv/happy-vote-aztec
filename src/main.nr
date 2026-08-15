// HappyVote — multi-poll voting on Aztec
//
// Iteration 1:
// - Admin creates polls (any topic / N options)
// - Private ballot + public tally (default)
// - Optional open (public) ballot when poll policy allows
// - One vote per account per poll via SingleUseClaim nullifiers (or once per UTC day)
// - ZKPassport polls: one uniqueIdentifier claim per poll (or per UTC day)
// - Optional on-chain starts_at / ends_at (unix seconds; 0 = unset)
// - vote_frequency at create: 0 = once per poll, 1 = once per UTC day (private and open)
//   Packed into `sealed` flags (bit1) so Noir type-complexity stays under the compiler cap.
//
// Pattern: Aztec private_voting_contract (v5.1.0) — private claim + public tally.
//
// Security notes:
// - Poll config that never changes is PublicImmutable so private votes can
//   reject bad option / privacy / eligibility *before* spending the nullifier.
// - ends_at is enforced in public (timestamp) and as tx expiration_timestamp.
// - starts_at cannot be fully enforced in private (no inclusion time); public
//   rejects early votes. Do not submit ballots before start.
// - identity_commitment is claimed by the voter; ZKPassport proofs are
//   re-verified off-chain. Direct contract calls can pass an arbitrary Field.
// - sealed hides view functions; raw public storage of tallies is still readable.

mod test;

use aztec::macros::aztec;

#[aztec]
pub contract HappyVote {
    use aztec::macros::{functions::{external, initializer, internal, only_self, view}, storage::storage};
    use aztec::protocol::{address::AztecAddress, hash::poseidon2_hash, traits::{Deserialize, Serialize, ToField}};
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

    /// One ballot per account (and identity) for the life of the poll.
    global VOTE_ONCE: u8 = 0;
    /// One ballot per account (and identity) per UTC calendar day.
    global VOTE_DAILY: u8 = 1;
    global SECONDS_PER_DAY: u64 = 86400;
    global PERIOD_KEY_SHIFT: Field = 4294967296;
    /// Packed into `sealed` storage: bit 0 = hide tallies until close.
    global FLAG_SEALED: u8 = 1;
    /// Packed into `sealed` storage: bit 1 = UTC-day vote frequency.
    global FLAG_DAILY: u8 = 2;

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
        // Slots 1–13 keep the original field order (guest API tally maps).
        admin: PublicMutable<AztecAddress, Context>,
        options_count: Map<PollId, PublicImmutable<u32, Context>, Context>,
        privacy_policy: Map<PollId, PublicImmutable<u8, Context>, Context>,
        eligibility_mode: Map<PollId, PublicImmutable<u8, Context>, Context>,
        metadata_hash: Map<PollId, PublicImmutable<Field, Context>, Context>,
        tally: Map<PollId, Map<Field, PublicMutable<Field, Context>, Context>, Context>,
        total_votes: Map<PollId, PublicMutable<Field, Context>, Context>,
        vote_ended: Map<PollId, PublicMutable<bool, Context>, Context>,
        active_at_block: Map<PollId, PublicImmutable<u32, Context>, Context>,
        /// Claim domain: packed (poll, period) → account. Period is 0 if once-only.
        vote_claims: Map<Field, Owned<SingleUseClaim<Context>, Context>, Context>,
        /// Open ballot value = option_id + 1 (0 means none). Latest open choice for this account.
        open_ballots: Map<PollId, Map<AztecAddress, PublicMutable<Field, Context>, Context>, Context>,
        /// ZKPassport uniqueIdentifier claimed per Poseidon(poll, period, identity).
        identity_claims: Map<Field, PublicMutable<bool, Context>, Context>,
        /// Packed flags: bit0 sealed tallies, bit1 UTC-day frequency (slot 13).
        sealed: Map<PollId, PublicImmutable<u8, Context>, Context>,
        /// Unix seconds. 0 = no scheduled start.
        starts_at: Map<PollId, PublicImmutable<u64, Context>, Context>,
        /// Unix seconds. 0 = no scheduled end (until end_poll / cancel).
        ends_at: Map<PollId, PublicImmutable<u64, Context>, Context>,
        cancelled: Map<PollId, PublicMutable<bool, Context>, Context>,
        next_poll_id: PublicMutable<u64, Context>,
        paused: PublicMutable<bool, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        assert(!admin.eq(AztecAddress::zero()), "Admin must be non-zero");
        self.storage.admin.write(admin);
        self.storage.paused.write(false);
        self.storage.next_poll_id.write(1 as u64);
    }

    #[internal("public")]
    fn assert_admin() {
        assert(self.storage.admin.read().eq(self.msg_sender()), "Only admin");
    }

    #[internal("public")]
    fn assert_not_paused() {
        assert(self.storage.paused.read() == false, "Contract is paused");
    }

    /// Closed by admin end, cancel, or scheduled ends_at.
    #[internal("public")]
    fn poll_is_closed(poll_id: PollId) -> bool {
        if self.storage.vote_ended.at(poll_id).read() {
            true
        } else if self.storage.cancelled.at(poll_id).read() {
            true
        } else {
            let ends_at = self.storage.ends_at.at(poll_id).read();
            if ends_at != (0 as u64) {
                self.context.timestamp() >= ends_at
            } else {
                false
            }
        }
    }

    #[internal("public")]
    fn assert_poll_exists(poll_id: PollId) {
        assert(self.storage.options_count.at(poll_id).is_initialized(), "Poll does not exist");
    }

    /// Reject invalid option / privacy / eligibility before spending the nullifier.
    /// Sets tx expiration to ends_at - 1 and/or end of the UTC day so a late inclusion
    /// cannot burn a claim after the window.
    #[internal("private")]
    fn assert_ballot_private(
        poll_id: PollId,
        option_id: Field,
        identity_commitment: Field,
        open_vote: bool,
        vote_period: Field,
    ) {
        let count = self.storage.options_count.at(poll_id).read();
        let truncated = option_id as u32;
        assert(truncated < count, "Invalid option");
        let option = truncated as Field;
        assert(option_id == option, "Invalid option");

        let policy = self.storage.privacy_policy.at(poll_id).read();
        if open_vote {
            assert(policy != PRIVACY_PRIVATE_ONLY, "Poll requires private votes");
        } else {
            assert(policy != PRIVACY_PUBLIC_ONLY, "Poll requires open votes");
        }

        let mode = self.storage.eligibility_mode.at(poll_id).read();
        if mode == ELIGIBILITY_OPEN {
            assert(identity_commitment == 0, "Identity not allowed for open polls");
        } else {
            assert(identity_commitment != 0, "ZKPassport identity required");
        }

        let flags = self.storage.sealed.at(poll_id).read();
        let freq = if (flags & FLAG_DAILY) != (0 as u8) { VOTE_DAILY } else { VOTE_ONCE };
        assert(freq <= VOTE_DAILY, "Unsupported vote frequency");
        if freq == VOTE_ONCE {
            assert(vote_period == 0, "Wrong vote period");
        } else {
            let period_u64 = vote_period as u64;
            assert(vote_period == period_u64 as Field, "Wrong vote period");
        }

        let mut expiry: u64 = 0;
        let ends_at = self.storage.ends_at.at(poll_id).read();
        if ends_at != (0 as u64) {
            expiry = ends_at - 1;
        }
        if freq == VOTE_DAILY {
            let period_u64 = vote_period as u64;
            let day_end = (period_u64 + 1) * SECONDS_PER_DAY - 1;
            if expiry == (0 as u64) {
                expiry = day_end;
            } else if day_end < expiry {
                expiry = day_end;
            }
        }
        if expiry != (0 as u64) {
            self.context.set_expiration_timestamp(expiry);
        }
    }

    #[external("public")]
    fn create_poll(
        poll_id: PollId,
        options_count: u32,
        privacy_policy: u8,
        eligibility_mode: u8,
        metadata_hash: Field,
        sealed: bool,
        starts_at: u64,
        ends_at: u64,
        vote_frequency: u8,
    ) -> Field {
        self.internal.assert_admin();
        self.internal.assert_not_paused();
        assert(options_count >= 2, "Need at least 2 options");
        assert(options_count <= MAX_OPTIONS, "Too many options");
        assert(privacy_policy <= PRIVACY_VOTER_CHOICE, "Invalid privacy policy");
        assert(eligibility_mode <= ELIGIBILITY_GATED, "Unsupported eligibility mode");
        assert(vote_frequency <= VOTE_DAILY, "Unsupported vote frequency");

        let mut resolved_u64 = poll_id.id as u64;
        assert(poll_id.id == resolved_u64 as Field, "poll_id overflow");
        if resolved_u64 == (0 as u64) {
            resolved_u64 = self.storage.next_poll_id.read();
        }
        let resolved = PollId::new(resolved_u64 as Field);
        assert(
            self.storage.options_count.at(resolved).is_initialized() == false,
            "Poll already exists",
        );

        if (starts_at != (0 as u64)) & (ends_at != (0 as u64)) {
            assert(ends_at > starts_at, "End must be after start");
        }
        if ends_at != (0 as u64) {
            assert(ends_at > self.context.timestamp(), "End must be in the future");
        }

        self.storage.options_count.at(resolved).initialize(options_count);
        self.storage.privacy_policy.at(resolved).initialize(privacy_policy);
        self.storage.eligibility_mode.at(resolved).initialize(eligibility_mode);
        self.storage.metadata_hash.at(resolved).initialize(metadata_hash);
        self.storage.starts_at.at(resolved).initialize(starts_at);
        self.storage.ends_at.at(resolved).initialize(ends_at);
        let mut flags: u8 = 0;
        if sealed {
            flags = flags + FLAG_SEALED;
        }
        if vote_frequency == VOTE_DAILY {
            flags = flags + FLAG_DAILY;
        }
        self.storage.sealed.at(resolved).initialize(flags);
        self.storage.vote_ended.at(resolved).write(false);
        self.storage.cancelled.at(resolved).write(false);
        self.storage.total_votes.at(resolved).write(0);
        self.storage.active_at_block.at(resolved).initialize(self.context.block_number());

        let next = self.storage.next_poll_id.read();
        if resolved_u64 >= next {
            self.storage.next_poll_id.write(resolved_u64 + 1);
        }

        resolved_u64 as Field
    }

    /// Private ballot — voter address stays hidden; option_id is public in the
    /// enqueued tally update (live public tallies). Same nullifier domain as open votes.
    /// `identity_commitment`: 0 for open eligibility; ZKPassport UID field otherwise.
    /// `vote_period`: 0 if once-only; UTC day index (`timestamp / 86400`) if daily.
    #[external("private")]
    fn cast_vote_private(
        poll_id: PollId,
        option_id: Field,
        identity_commitment: Field,
        vote_period: Field,
    ) {
        self.internal.assert_ballot_private(
            poll_id,
            option_id,
            identity_commitment,
            false,
            vote_period,
        );
        self.storage.vote_claims.at(poll_id.id + vote_period * PERIOD_KEY_SHIFT).at(self.msg_sender()).claim();
        self.enqueue_self.add_to_tally_public(poll_id, option_id, identity_commitment, vote_period);
    }

    /// Open ballot — voter + choice recorded publicly.
    /// Uses the same claim domain as private votes (no double voting across modes).
    #[external("private")]
    fn cast_vote_open(
        poll_id: PollId,
        option_id: Field,
        identity_commitment: Field,
        vote_period: Field,
    ) {
        self.internal.assert_ballot_private(
            poll_id,
            option_id,
            identity_commitment,
            true,
            vote_period,
        );
        let voter = self.msg_sender();
        self.storage.vote_claims.at(poll_id.id + vote_period * PERIOD_KEY_SHIFT).at(voter).claim();
        self.enqueue_self.record_open_vote_public(
            poll_id,
            voter,
            option_id,
            identity_commitment,
            vote_period,
        );
    }

    #[external("public")]
    #[only_self]
    fn add_to_tally_public(
        poll_id: PollId,
        option_id: Field,
        identity_commitment: Field,
        vote_period: Field,
    ) {
        self.internal.assert_vote_allowed(poll_id, identity_commitment, vote_period);
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
        vote_period: Field,
    ) {
        self.internal.assert_vote_allowed(poll_id, identity_commitment, vote_period);
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

    /// Enforce window + eligibility + claim ZKPassport identity when required.
    #[internal("public")]
    fn assert_vote_allowed(poll_id: PollId, identity_commitment: Field, vote_period: Field) {
        self.internal.assert_not_paused();
        self.internal.assert_poll_exists(poll_id);
        assert(self.internal.poll_is_closed(poll_id) == false, "Vote has ended");
        let flags = self.storage.sealed.at(poll_id).read();
        let freq = if (flags & FLAG_DAILY) != (0 as u8) { VOTE_DAILY } else { VOTE_ONCE };
        let expected_period = if freq == VOTE_ONCE {
            0
        } else {
            (self.context.timestamp() / SECONDS_PER_DAY) as Field
        };
        assert(vote_period == expected_period, "Wrong vote period");

        let starts_at = self.storage.starts_at.at(poll_id).read();
        if starts_at != (0 as u64) {
            assert(self.context.timestamp() >= starts_at, "Poll not started");
        }

        let mode = self.storage.eligibility_mode.at(poll_id).read();
        if mode == ELIGIBILITY_OPEN {
            assert(identity_commitment == 0, "Identity not allowed for open polls");
        } else {
            assert(identity_commitment != 0, "ZKPassport identity required");
            let key = poseidon2_hash([poll_id.id, vote_period, identity_commitment]);
            assert(self.storage.identity_claims.at(key).read() == false, "Identity already voted");
            self.storage.identity_claims.at(key).write(true);
        }
    }

    #[external("public")]
    fn end_poll(poll_id: PollId) {
        self.internal.assert_admin();
        self.internal.assert_poll_exists(poll_id);
        self.storage.vote_ended.at(poll_id).write(true);
    }

    /// Cancel a poll that has received no votes (wrong dates / text). Closes voting.
    #[external("public")]
    fn cancel_poll(poll_id: PollId) {
        self.internal.assert_admin();
        self.internal.assert_poll_exists(poll_id);
        assert(self.storage.vote_ended.at(poll_id).read() == false, "Vote has ended");
        assert(self.storage.total_votes.at(poll_id).read() == 0, "Poll already has votes");
        self.storage.cancelled.at(poll_id).write(true);
        self.storage.vote_ended.at(poll_id).write(true);
    }

    #[external("public")]
    fn transfer_admin(new_admin: AztecAddress) {
        self.internal.assert_admin();
        assert(!new_admin.eq(AztecAddress::zero()), "Admin must be non-zero");
        self.storage.admin.write(new_admin);
    }

    #[external("public")]
    fn set_paused(paused: bool) {
        self.internal.assert_admin();
        self.storage.paused.write(paused);
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
        let flags = self.storage.sealed.at(poll_id).read();
        let freq = if (flags & FLAG_DAILY) != (0 as u8) { VOTE_DAILY } else { VOTE_ONCE };
        let period = if freq == VOTE_ONCE {
            0
        } else {
            (self.context.timestamp() / SECONDS_PER_DAY) as Field
        };
        self.storage.identity_claims.at(poseidon2_hash([poll_id.id, period, identity_commitment])).read()
    }

    #[external("public")]
    #[view]
    fn get_vote_frequency(poll_id: PollId) -> u8 {
        if (self.storage.sealed.at(poll_id).read() & FLAG_DAILY) != (0 as u8) {
            VOTE_DAILY
        } else {
            VOTE_ONCE
        }
    }

    #[external("public")]
    #[view]
    fn get_current_vote_period(poll_id: PollId) -> Field {
        let flags = self.storage.sealed.at(poll_id).read();
        if (flags & FLAG_DAILY) != (0 as u8) {
            (self.context.timestamp() / SECONDS_PER_DAY) as Field
        } else {
            0
        }
    }

    #[external("public")]
    #[view]
    fn get_sealed(poll_id: PollId) -> bool {
        (self.storage.sealed.at(poll_id).read() & FLAG_SEALED) != (0 as u8)
    }

    #[external("public")]
    #[view]
    fn get_starts_at(poll_id: PollId) -> u64 {
        self.storage.starts_at.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_ends_at(poll_id: PollId) -> u64 {
        self.storage.ends_at.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_cancelled(poll_id: PollId) -> bool {
        self.storage.cancelled.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_paused() -> bool {
        self.storage.paused.read()
    }

    #[external("public")]
    #[view]
    fn get_next_poll_id() -> u64 {
        self.storage.next_poll_id.read()
    }

    #[external("public")]
    #[view]
    fn is_voting_open(poll_id: PollId) -> bool {
        if self.storage.options_count.at(poll_id).is_initialized() == false {
            false
        } else if self.storage.paused.read() {
            false
        } else if self.internal.poll_is_closed(poll_id) {
            false
        } else {
            let starts_at = self.storage.starts_at.at(poll_id).read();
            if starts_at == (0 as u64) {
                true
            } else {
                self.context.timestamp() >= starts_at
            }
        }
    }

    #[external("public")]
    #[view]
    fn get_admin() -> AztecAddress {
        self.storage.admin.read()
    }

    #[internal("public")]
    fn tallies_hidden(poll_id: PollId) -> bool {
        if (self.storage.sealed.at(poll_id).read() & FLAG_SEALED) != (0 as u8) {
            self.internal.poll_is_closed(poll_id) == false
        } else {
            false
        }
    }
}
