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
// - Personhood and gated polls accept an identity only with a secp256k1 attestation
//   over poll, identity, period, and expiry. The site signs that after it re-verifies
//   the ZKPassport proof. An arbitrary Field is rejected.
// - Sealed polls do not publish the chosen option. SealedTallyBook stores it in a
//   private note for the tally recipient. Public per-option totals stay zero until
//   that recipient publishes them after the poll closes.
// - fund_pool is an accounting credit. Only the admin or the configured pool payer
//   can raise it. A poll creator cannot inflate the balance the payer spends.

pub global ZK_ATTEST_DOMAIN: Field = 0x48565f5a4b;
pub global ZK_ATTEST_WINDOW: u64 = 1200;

pub fn u128_pair_to_be_bytes(hi: u128, lo: u128) -> [u8; 32] {
    let hi_bytes: [u8; 32] = (hi as Field).to_be_bytes();
    let lo_bytes: [u8; 32] = (lo as Field).to_be_bytes();
    let mut out: [u8; 32] = [0; 32];
    for i in 0..16 {
        out[i] = hi_bytes[16 + i];
        out[16 + i] = lo_bytes[16 + i];
    }
    out
}

pub fn zk_attestation_digest(poll_id: Field, identity: Field, period: Field, expiry: u64) -> [u8; 32] {
    let mut message: [u8; 160] = [0; 160];
    let poll_bytes: [u8; 32] = poll_id.to_be_bytes();
    let identity_bytes: [u8; 32] = identity.to_be_bytes();
    let period_bytes: [u8; 32] = period.to_be_bytes();
    let expiry_bytes: [u8; 32] = (expiry as Field).to_be_bytes();
    let domain_bytes: [u8; 32] = ZK_ATTEST_DOMAIN.to_be_bytes();
    for i in 0..32 {
        message[i] = poll_bytes[i];
        message[32 + i] = identity_bytes[i];
        message[64 + i] = period_bytes[i];
        message[96 + i] = expiry_bytes[i];
        message[128 + i] = domain_bytes[i];
    }
    sha256::digest(message)
}

pub fn assert_zk_attestation(
    x_hi: u128,
    x_lo: u128,
    y_hi: u128,
    y_lo: u128,
    poll_id: Field,
    identity: Field,
    period: Field,
    expiry: u64,
    sig_r: [u8; 32],
    sig_s: [u8; 32],
) {
    assert((x_hi != 0) | (x_lo != 0), "ZK signer is not set");
    let digest = zk_attestation_digest(poll_id, identity, period, expiry);
    let mut signature: [u8; 64] = [0; 64];
    for i in 0..32 {
        signature[i] = sig_r[i];
        signature[32 + i] = sig_s[i];
    }
    let ok = std::ecdsa_secp256k1::verify_signature(
        u128_pair_to_be_bytes(x_hi, x_lo),
        u128_pair_to_be_bytes(y_hi, y_lo),
        signature,
        digest,
    );
    assert(ok, "ZK attestation rejected");
}

mod test;

use aztec::protocol::hash::poseidon2_hash;

// Free helpers stay outside the contract. Extra #[internal] methods push
// ContractSelfPrivate over the Noir type-complexity cap.
fn sponsored_bit() -> u64 {
    (1 as u64) << 63
}

fn id_counter(stored: u64) -> u64 {
    stored & (((1 as u64) << 63) - 1)
}

fn sponsored_on(stored: u64) -> bool {
    (stored >> 63) == (1 as u64)
}

fn with_sponsored(counter: u64, allowed: bool) -> u64 {
    if allowed {
        counter | sponsored_bit()
    } else {
        counter
    }
}

/// Domain separator for a hidden author's capability. Distinct from the public daily claim (7) and the authoritative mark (8).
pub fn author_commitment_of(secret: Field, poll_id: Field) -> Field {
    poseidon2_hash([secret, poll_id, 9])
}

fn pack_pool(remaining: u64, juice: u64, refunded: u64) -> Field {
    let shift64: Field = 0x10000000000000000;
    let shift128: Field = 0x100000000000000000000000000000000;
    (remaining as Field) + (juice as Field) * shift64 + (refunded as Field) * shift128
}

fn unpack_pool(raw: Field) -> (u64, u64, u64) {
    let b = raw.to_le_bytes::<32>();
    let remaining = (b[0] as u64)
        + ((b[1] as u64) << 8)
        + ((b[2] as u64) << 16)
        + ((b[3] as u64) << 24)
        + ((b[4] as u64) << 32)
        + ((b[5] as u64) << 40)
        + ((b[6] as u64) << 48)
        + ((b[7] as u64) << 56);
    let juice = (b[8] as u64)
        + ((b[9] as u64) << 8)
        + ((b[10] as u64) << 16)
        + ((b[11] as u64) << 24)
        + ((b[12] as u64) << 32)
        + ((b[13] as u64) << 40)
        + ((b[14] as u64) << 48)
        + ((b[15] as u64) << 56);
    let refunded = (b[16] as u64)
        + ((b[17] as u64) << 8)
        + ((b[18] as u64) << 16)
        + ((b[19] as u64) << 24)
        + ((b[20] as u64) << 32)
        + ((b[21] as u64) << 40)
        + ((b[22] as u64) << 48)
        + ((b[23] as u64) << 56);
    (remaining, juice, refunded)
}

use aztec::macros::aztec;

#[aztec]
pub contract HappyVote {
    use aztec::macros::{functions::{external, initializer, internal, only_self, view}, storage::storage};
    use aztec::protocol::{address::AztecAddress, hash::poseidon2_hash, traits::{Deserialize, FromField, Serialize, ToField}};
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
    /// Packed into `sealed` storage: bit 0 = option is a private note on SealedTallyBook.
    global FLAG_SEALED: u8 = 1;
    /// Packed into `sealed` storage: bit 1 = UTC-day vote frequency.
    global FLAG_DAILY: u8 = 2;

    /// Ballot network-fee mode, fixed at create.
    global FEE_SPONSORED: u8 = 0;
    global FEE_VOTER: u8 = 1;
    global FEE_POOL: u8 = 2;
    /// When sponsorship or the pool cannot pay.
    global FALLBACK_STOP: u8 = 0;
    global FALLBACK_VOTER: u8 = 1;
    /// User-created polls: one create per account per UTC day, and at most this many still open.
    global MAX_OPEN_USER_POLLS: u32 = 3;
    /// ends_at may be at most this far after starts_at, or after the block time when starts_at is 0.
    global MAX_WINDOW_SECONDS: u64 = 7776000;
    /// Iteration 2 records live in the existing tally map, above any option index.
    global TAG_CREATOR: Field = 200;
    global TAG_FEE: Field = 201;
    global TAG_POOL: Field = 202;
    global TAG_PUBX: Field = 203;
    global TAG_PUBY: Field = 204;
    global TAG_SLOT0: Field = 210;
    global TAG_SLOT1: Field = 211;
    global TAG_SLOT2: Field = 212;
    global TAG_PAYER: Field = 220;
    /// 0 for a public author. Poseidon commitment when the author is hidden.
    /// Stored in the existing tally map so the Storage type stays under the Noir complexity cap.
    global TAG_AUTHOR: Field = 205;
    global TAG_RECIPIENT: Field = 206;
    global TAG_SEALED_BALLOTS: Field = 207;
    global TAG_SEALED_COUNTED: Field = 208;
    global TAG_ZK_X_HI: Field = 221;
    global TAG_ZK_X_LO: Field = 222;
    global TAG_ZK_Y_HI: Field = 223;
    global TAG_ZK_Y_LO: Field = 224;
    global TAG_SEALED_BOOK: Field = 225;

    #[derive(Serialize, Deserialize)]
    pub struct PollId {
        id: Field,
    }

    impl PollId {
        pub fn new(id: Field) -> Self {
            Self { id }
        }

        pub fn value(self) -> Field {
            self.id
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
        /// The only contract allowed to create or finish a hidden-author poll. Set once by admin.
        hidden_author_book: PublicImmutable<AztecAddress, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        assert(!admin.eq(AztecAddress::zero()), "Admin must be non-zero");
        self.storage.admin.write(admin);
        self.storage.paused.write(false);
        self.storage.next_poll_id.write(crate::with_sponsored(1, true));
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
        if (flags & FLAG_SEALED) != (0 as u8) {
            assert(false, "Sealed ballot uses the tally book");
        }
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
        if sealed {
            assert(privacy_policy != PRIVACY_PUBLIC_ONLY, "Sealed poll cannot be open-only");
        }
        assert(eligibility_mode <= ELIGIBILITY_GATED, "Unsupported eligibility mode");
        assert(vote_frequency <= VOTE_DAILY, "Unsupported vote frequency");

        let mut resolved_u64 = poll_id.id as u64;
        assert(poll_id.id == resolved_u64 as Field, "poll_id overflow");
        let stored_next = self.storage.next_poll_id.read();
        let next = crate::id_counter(stored_next);
        if resolved_u64 == (0 as u64) {
            resolved_u64 = next;
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
        self.storage.tally.at(resolved).at(TAG_RECIPIENT).write(self.msg_sender().to_field());
        self.storage.tally.at(resolved).at(TAG_SEALED_BALLOTS).write(0);
        self.storage.tally.at(resolved).at(TAG_SEALED_COUNTED).write(0);
        self.storage.vote_ended.at(resolved).write(false);
        self.storage.cancelled.at(resolved).write(false);
        self.storage.total_votes.at(resolved).write(0);
        self.storage.active_at_block.at(resolved).initialize(self.context.block_number());
        self.storage.tally.at(resolved).at(TAG_CREATOR).write(self.msg_sender().to_field());
        let admin_fee: u8 = if crate::sponsored_on(self.storage.next_poll_id.read()) {
            FEE_SPONSORED
        } else {
            FEE_VOTER
        };
        self.storage.tally.at(resolved).at(TAG_FEE).write((admin_fee + FALLBACK_STOP * 16) as Field);
        self.storage.tally.at(resolved).at(TAG_PUBX).write(0);
        self.storage.tally.at(resolved).at(TAG_PUBY).write(0);
        self.storage.tally.at(resolved).at(TAG_AUTHOR).write(0);

        if resolved_u64 >= next {
            self.storage.next_poll_id.write(crate::with_sponsored(resolved_u64 + 1, crate::sponsored_on(stored_next)));
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
        self.enqueue_self.add_to_tally_public(
            poll_id,
            option_id,
            identity_commitment,
            vote_period,
            false,
            0,
            0,
            0,
            0,
            0,
            [0; 32],
            [0; 32],
        );
    }

    /// Same ballot as `cast_vote_private`, plus the site attestation for a personhood or gated poll.
    #[external("private")]
    fn cast_vote_private_attested(
        poll_id: PollId,
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
    ) {
        self.internal.assert_ballot_private(
            poll_id,
            option_id,
            identity_commitment,
            false,
            vote_period,
        );
        self.internal.prove_zk_attestation(
            poll_id.id,
            identity_commitment,
            vote_period,
            expiry,
            x_hi,
            x_lo,
            y_hi,
            y_lo,
            sig_r,
            sig_s,
        );
        self.storage.vote_claims.at(poll_id.id + vote_period * PERIOD_KEY_SHIFT).at(self.msg_sender()).claim();
        self.enqueue_self.add_to_tally_public(
            poll_id,
            option_id,
            identity_commitment,
            vote_period,
            true,
            expiry,
            x_hi,
            x_lo,
            y_hi,
            y_lo,
            sig_r,
            sig_s,
        );
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
            false,
            0,
            0,
            0,
            0,
            0,
            [0; 32],
            [0; 32],
        );
    }

    /// Same ballot as `cast_vote_open`, plus the site attestation for a personhood or gated poll.
    #[external("private")]
    fn cast_vote_open_attested(
        poll_id: PollId,
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
    ) {
        self.internal.assert_ballot_private(
            poll_id,
            option_id,
            identity_commitment,
            true,
            vote_period,
        );
        self.internal.prove_zk_attestation(
            poll_id.id,
            identity_commitment,
            vote_period,
            expiry,
            x_hi,
            x_lo,
            y_hi,
            y_lo,
            sig_r,
            sig_s,
        );
        let voter = self.msg_sender();
        self.storage.vote_claims.at(poll_id.id + vote_period * PERIOD_KEY_SHIFT).at(voter).claim();
        self.enqueue_self.record_open_vote_public(
            poll_id,
            voter,
            option_id,
            identity_commitment,
            vote_period,
            true,
            expiry,
            x_hi,
            x_lo,
            y_hi,
            y_lo,
            sig_r,
            sig_s,
        );
    }

    #[external("public")]
    #[only_self]
    fn add_to_tally_public(
        poll_id: PollId,
        option_id: Field,
        identity_commitment: Field,
        vote_period: Field,
        attested: bool,
        expiry: u64,
        x_hi: Field,
        x_lo: Field,
        y_hi: Field,
        y_lo: Field,
        sig_r: [u8; 32],
        sig_s: [u8; 32],
    ) {
        self.internal.assert_vote_allowed(poll_id, identity_commitment, vote_period);
        self.internal.assert_identity_attestation(
            poll_id,
            identity_commitment,
            vote_period,
            attested,
            expiry,
            x_hi,
            x_lo,
            y_hi,
            y_lo,
            sig_r,
            sig_s,
        );
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
        attested: bool,
        expiry: u64,
        x_hi: Field,
        x_lo: Field,
        y_hi: Field,
        y_lo: Field,
        sig_r: [u8; 32],
        sig_s: [u8; 32],
    ) {
        self.internal.assert_vote_allowed(poll_id, identity_commitment, vote_period);
        self.internal.assert_identity_attestation(
            poll_id,
            identity_commitment,
            vote_period,
            attested,
            expiry,
            x_hi,
            x_lo,
            y_hi,
            y_lo,
            sig_r,
            sig_s,
        );
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

    /// Signature check stays in private. The public AVM transpiler does not accept secp256k1.
    #[internal("private")]
    fn prove_zk_attestation(
        poll_id: Field,
        identity_commitment: Field,
        vote_period: Field,
        expiry: u64,
        x_hi: Field,
        x_lo: Field,
        y_hi: Field,
        y_lo: Field,
        sig_r: [u8; 32],
        sig_s: [u8; 32],
    ) {
        crate::assert_zk_attestation(
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

    #[internal("public")]
    fn assert_identity_attestation(
        poll_id: PollId,
        identity_commitment: Field,
        vote_period: Field,
        attested: bool,
        expiry: u64,
        x_hi: Field,
        x_lo: Field,
        y_hi: Field,
        y_lo: Field,
        sig_r: [u8; 32],
        sig_s: [u8; 32],
    ) {
        let mode = self.storage.eligibility_mode.at(poll_id).read();
        if mode != ELIGIBILITY_OPEN {
            assert(attested, "ZK attestation required");
            let now = self.context.timestamp();
            assert(now <= expiry, "ZK attestation expired");
            assert(expiry - now <= crate::ZK_ATTEST_WINDOW, "ZK attestation window");
            let root = PollId::new(0);
            assert(x_hi == self.storage.tally.at(root).at(TAG_ZK_X_HI).read(), "ZK attestation rejected");
            assert(x_lo == self.storage.tally.at(root).at(TAG_ZK_X_LO).read(), "ZK attestation rejected");
            assert(y_hi == self.storage.tally.at(root).at(TAG_ZK_Y_HI).read(), "ZK attestation rejected");
            assert(y_lo == self.storage.tally.at(root).at(TAG_ZK_Y_LO).read(), "ZK attestation rejected");
        }
        let _ = sig_r;
        let _ = sig_s;
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
        let sender = self.msg_sender();
        if sender.eq(self.storage.admin.read()) == false {
            let creator_field = self.storage.tally.at(poll_id).at(TAG_CREATOR).read();
            assert(creator_field != 0, "Only admin");
            assert(creator_field == sender.to_field(), "Only admin");
        }
        self.internal.assert_poll_exists(poll_id);
        self.storage.vote_ended.at(poll_id).write(true);
        let creator_field = self.storage.tally.at(poll_id).at(TAG_CREATOR).read();
        if creator_field != 0 {
            let owner = PollId::new(creator_field);
            if self.storage.tally.at(owner).at(TAG_SLOT0).read() == poll_id.id {
                self.storage.tally.at(owner).at(TAG_SLOT0).write(0);
            }
            if self.storage.tally.at(owner).at(TAG_SLOT1).read() == poll_id.id {
                self.storage.tally.at(owner).at(TAG_SLOT1).write(0);
            }
            if self.storage.tally.at(owner).at(TAG_SLOT2).read() == poll_id.id {
                self.storage.tally.at(owner).at(TAG_SLOT2).write(0);
            }
        }
        let (_, juice, _) = crate::unpack_pool(self.storage.tally.at(poll_id).at(TAG_POOL).read());
        if juice != (0 as u64) {
            self.storage.tally.at(poll_id).at(TAG_POOL).write(crate::pack_pool(0, 0, juice));
        }
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
        let creator_field = self.storage.tally.at(poll_id).at(TAG_CREATOR).read();
        if creator_field != 0 {
            let owner = PollId::new(creator_field);
            if self.storage.tally.at(owner).at(TAG_SLOT0).read() == poll_id.id {
                self.storage.tally.at(owner).at(TAG_SLOT0).write(0);
            }
            if self.storage.tally.at(owner).at(TAG_SLOT1).read() == poll_id.id {
                self.storage.tally.at(owner).at(TAG_SLOT1).write(0);
            }
            if self.storage.tally.at(owner).at(TAG_SLOT2).read() == poll_id.id {
                self.storage.tally.at(owner).at(TAG_SLOT2).write(0);
            }
        }
        let (_, juice, _) = crate::unpack_pool(self.storage.tally.at(poll_id).at(TAG_POOL).read());
        if juice != (0 as u64) {
            self.storage.tally.at(poll_id).at(TAG_POOL).write(crate::pack_pool(0, 0, juice));
        }
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
        crate::id_counter(self.storage.next_poll_id.read())
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
            self.storage.tally.at(poll_id).at(TAG_SEALED_BALLOTS).read()
                != self.storage.tally.at(poll_id).at(TAG_SEALED_COUNTED).read()
        } else {
            false
        }
    }

    /// Any account. The caller does not choose the id. Admin `create_poll` is unchanged.
    #[external("public")]
    fn create_user_poll(
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
    ) -> Field {
        self.internal.assert_not_paused();
        assert(options_count >= 2, "Need at least 2 options");
        assert(options_count <= MAX_OPTIONS, "Too many options");
        assert(privacy_policy <= PRIVACY_VOTER_CHOICE, "Invalid privacy policy");
        if sealed {
            assert(privacy_policy != PRIVACY_PUBLIC_ONLY, "Sealed poll cannot be open-only");
        }
        assert(eligibility_mode <= ELIGIBILITY_GATED, "Unsupported eligibility mode");
        assert(vote_frequency <= VOTE_DAILY, "Unsupported vote frequency");
        assert(metadata_hash != 0, "Metadata hash required");
        assert(fee_mode <= FEE_POOL, "Invalid fee mode");
        assert(fee_fallback <= FALLBACK_VOTER, "Invalid fee fallback");
        assert(
            (signing_pubkey_x != 0) | (signing_pubkey_y != 0),
            "Signing key required",
        );
        if fee_mode == FEE_SPONSORED {
            assert(crate::sponsored_on(self.storage.next_poll_id.read()), "Sponsored fees are not available");
        }
        assert(ends_at != (0 as u64), "End is required");
        assert(ends_at > self.context.timestamp(), "End must be in the future");
        let start_base = if starts_at == (0 as u64) {
            self.context.timestamp()
        } else {
            starts_at
        };
        assert(ends_at > start_base, "End must be after start");
        assert(ends_at - start_base <= MAX_WINDOW_SECONDS, "Window exceeds 90 days");

        let creator = self.msg_sender();
        assert(creator.eq(AztecAddress::zero()) == false, "Creator required");
        let day = self.context.timestamp() / SECONDS_PER_DAY;
        let claim_key = poseidon2_hash([creator.to_field(), day as Field, 7]);
        assert(self.storage.identity_claims.at(claim_key).read() == false, "Already created today");

        let stored_next = self.storage.next_poll_id.read();
        let resolved_u64 = crate::id_counter(stored_next);
        let resolved = PollId::new(resolved_u64 as Field);
        assert(
            self.storage.options_count.at(resolved).is_initialized() == false,
            "Poll already exists",
        );

        self.storage.identity_claims.at(claim_key).write(true);
        assert(MAX_OPEN_USER_POLLS == 3, "Open poll cap");
        let owner = PollId::new(creator.to_field());
        let s0 = self.storage.tally.at(owner).at(TAG_SLOT0).read();
        let s1 = self.storage.tally.at(owner).at(TAG_SLOT1).read();
        let s2 = self.storage.tally.at(owner).at(TAG_SLOT2).read();
        let id0 = PollId::new(s0);
        let id1 = PollId::new(s1);
        let id2 = PollId::new(s2);
        let s0_open = if s0 == 0 {
            false
        } else if self.storage.options_count.at(id0).is_initialized() == false {
            false
        } else {
            self.internal.poll_is_closed(id0) == false
        };
        let s1_open = if s1 == 0 {
            false
        } else if self.storage.options_count.at(id1).is_initialized() == false {
            false
        } else {
            self.internal.poll_is_closed(id1) == false
        };
        let s2_open = if s2 == 0 {
            false
        } else if self.storage.options_count.at(id2).is_initialized() == false {
            false
        } else {
            self.internal.poll_is_closed(id2) == false
        };
        if s0_open == false {
            self.storage.tally.at(owner).at(TAG_SLOT0).write(resolved.id);
        } else if s1_open == false {
            self.storage.tally.at(owner).at(TAG_SLOT1).write(resolved.id);
        } else if s2_open == false {
            self.storage.tally.at(owner).at(TAG_SLOT2).write(resolved.id);
        } else {
            assert(false, "Too many open polls");
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
        self.storage.tally.at(resolved).at(TAG_RECIPIENT).write(creator.to_field());
        self.storage.tally.at(resolved).at(TAG_SEALED_BALLOTS).write(0);
        self.storage.tally.at(resolved).at(TAG_SEALED_COUNTED).write(0);
        self.storage.vote_ended.at(resolved).write(false);
        self.storage.cancelled.at(resolved).write(false);
        self.storage.total_votes.at(resolved).write(0);
        self.storage.active_at_block.at(resolved).initialize(self.context.block_number());
        self.storage.tally.at(resolved).at(TAG_CREATOR).write(creator.to_field());
        self.storage.tally.at(resolved).at(TAG_FEE).write((fee_mode + fee_fallback * 16) as Field);
        self.storage.tally.at(resolved).at(TAG_PUBX).write(signing_pubkey_x);
        self.storage.tally.at(resolved).at(TAG_PUBY).write(signing_pubkey_y);
        self.storage.tally.at(resolved).at(TAG_AUTHOR).write(0);
        self.storage.next_poll_id.write(crate::with_sponsored(resolved_u64 + 1, crate::sponsored_on(stored_next)));
        resolved_u64 as Field
    }

    /// Admin sets the hidden-author book once. That contract holds the private note.
    /// HappyVote cannot hold it: another private note pushes this contract over the Noir type-complexity cap.
    #[external("public")]
    fn set_hidden_author_book(book: AztecAddress) {
        self.internal.assert_admin();
        assert(book.eq(AztecAddress::zero()) == false, "Book required");
        self.storage.hidden_author_book.initialize(book);
    }

    /// Admin sets the sealed-tally book once. That contract holds the private ballot notes.
    #[external("public")]
    fn set_sealed_tally_book(book: AztecAddress) {
        self.internal.assert_admin();
        assert(book.eq(AztecAddress::zero()) == false, "Book required");
        let root = PollId::new(0);
        assert(self.storage.tally.at(root).at(TAG_SEALED_BOOK).read() == 0, "Book already set");
        self.storage.tally.at(root).at(TAG_SEALED_BOOK).write(book.to_field());
    }

    /// secp256k1 public key that attests ZKPassport checks. Each half is 16 bytes.
    #[external("public")]
    fn set_zk_signer(x_hi: u128, x_lo: u128, y_hi: u128, y_lo: u128) {
        self.internal.assert_admin();
        assert((x_hi != 0) | (x_lo != 0), "ZK signer is not set");
        let root = PollId::new(0);
        self.storage.tally.at(root).at(TAG_ZK_X_HI).write(x_hi as Field);
        self.storage.tally.at(root).at(TAG_ZK_X_LO).write(x_lo as Field);
        self.storage.tally.at(root).at(TAG_ZK_Y_HI).write(y_hi as Field);
        self.storage.tally.at(root).at(TAG_ZK_Y_LO).write(y_lo as Field);
    }

    /// Sealed ballot accepted. The option stays in SealedTallyBook.
    #[external("public")]
    fn record_sealed_participation(
        poll_id: PollId,
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
        let book = AztecAddress::from_field(self.storage.tally.at(PollId::new(0)).at(TAG_SEALED_BOOK).read());
        assert(self.msg_sender().eq(book), "Only sealed tally book");
        assert(
            (self.storage.sealed.at(poll_id).read() & FLAG_SEALED) != (0 as u8),
            "Poll is not sealed",
        );
        self.internal.assert_vote_allowed(poll_id, identity_commitment, vote_period);
        self.internal.assert_identity_attestation(
            poll_id,
            identity_commitment,
            vote_period,
            true,
            expiry,
            x_hi,
            x_lo,
            y_hi,
            y_lo,
            sig_r,
            sig_s,
        );
        assert(eligibility_mode == self.storage.eligibility_mode.at(poll_id).read(), "Wrong eligibility");
        assert(options_count == self.storage.options_count.at(poll_id).read(), "Invalid option");
        assert(
            recipient.to_field() == self.storage.tally.at(poll_id).at(TAG_RECIPIENT).read(),
            "Only tally recipient",
        );
        assert(
            self.storage.privacy_policy.at(poll_id).read() != PRIVACY_PUBLIC_ONLY,
            "Poll requires open votes",
        );
        let next = self.storage.tally.at(poll_id).at(TAG_SEALED_BALLOTS).read() + 1;
        self.storage.tally.at(poll_id).at(TAG_SEALED_BALLOTS).write(next);
    }

    /// Add one revealed batch. Per-option views stay at zero until every sealed ballot is included.
    #[external("public")]
    fn publish_sealed_tally(poll_id: PollId, counts: [Field; 32], batch: u64, recipient: AztecAddress) {
        let book = AztecAddress::from_field(self.storage.tally.at(PollId::new(0)).at(TAG_SEALED_BOOK).read());
        assert(self.msg_sender().eq(book), "Only sealed tally book");
        self.internal.assert_poll_exists(poll_id);
        assert(self.internal.poll_is_closed(poll_id), "Vote has not ended");
        assert(
            (self.storage.sealed.at(poll_id).read() & FLAG_SEALED) != (0 as u8),
            "Poll is not sealed",
        );
        assert(batch != 0, "Sealed ballots missing");
        assert(
            recipient.to_field() == self.storage.tally.at(poll_id).at(TAG_RECIPIENT).read(),
            "Only tally recipient",
        );
        let options = self.storage.options_count.at(poll_id).read();
        let mut summed = 0;
        for i in 0..32 {
            if (i as u32) < options {
                let option = i as Field;
                let next = self.storage.tally.at(poll_id).at(option).read() + counts[i];
                self.storage.tally.at(poll_id).at(option).write(next);
                summed = summed + counts[i];
            }
        }
        assert(summed == (batch as Field), "Sealed tally overcounted");
        let counted = self.storage.tally.at(poll_id).at(TAG_SEALED_COUNTED).read() + (batch as Field);
        let accepted = self.storage.tally.at(poll_id).at(TAG_SEALED_BALLOTS).read();
        let counted_n = counted as u64;
        let accepted_n = accepted as u64;
        assert((counted_n as Field) == counted, "Sealed tally overcounted");
        assert(counted_n <= accepted_n, "Sealed tally overcounted");
        self.storage.tally.at(poll_id).at(TAG_SEALED_COUNTED).write(counted);
        self.storage.total_votes.at(poll_id).write(counted);
    }

    #[external("public")]
    #[view]
    fn get_tally_recipient(poll_id: PollId) -> AztecAddress {
        AztecAddress::from_field(self.storage.tally.at(poll_id).at(TAG_RECIPIENT).read())
    }

    #[external("public")]
    #[view]
    fn get_sealed_ballots(poll_id: PollId) -> Field {
        self.storage.tally.at(poll_id).at(TAG_SEALED_BALLOTS).read()
    }

    #[external("public")]
    #[view]
    fn get_sealed_tally_book() -> AztecAddress {
        AztecAddress::from_field(self.storage.tally.at(PollId::new(0)).at(TAG_SEALED_BOOK).read())
    }

    #[external("public")]
    #[view]
    fn get_zk_x_hi() -> Field {
        self.storage.tally.at(PollId::new(0)).at(TAG_ZK_X_HI).read()
    }

    #[external("public")]
    #[view]
    fn get_zk_x_lo() -> Field {
        self.storage.tally.at(PollId::new(0)).at(TAG_ZK_X_LO).read()
    }

    #[external("public")]
    #[view]
    fn get_zk_y_hi() -> Field {
        self.storage.tally.at(PollId::new(0)).at(TAG_ZK_Y_HI).read()
    }

    #[external("public")]
    #[view]
    fn get_zk_y_lo() -> Field {
        self.storage.tally.at(PollId::new(0)).at(TAG_ZK_Y_LO).read()
    }

    /// Called by the hidden-author book. The author's account is not an argument.
    /// `expected_id` must be the current next poll id. `claimed_day` must be the block's UTC day.
    #[external("public")]
    fn init_hidden_user_poll(
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
        commitment: Field,
    ) -> Field {
        assert(self.msg_sender().eq(self.storage.hidden_author_book.read()), "Only hidden author book");
        self.internal.assert_not_paused();
        assert(options_count >= 2, "Need at least 2 options");
        assert(options_count <= MAX_OPTIONS, "Too many options");
        assert(privacy_policy <= PRIVACY_VOTER_CHOICE, "Invalid privacy policy");
        if sealed {
            assert(privacy_policy != PRIVACY_PUBLIC_ONLY, "Sealed poll cannot be open-only");
        }
        assert(eligibility_mode <= ELIGIBILITY_GATED, "Unsupported eligibility mode");
        assert(vote_frequency <= VOTE_DAILY, "Unsupported vote frequency");
        assert(metadata_hash != 0, "Metadata hash required");
        assert(fee_mode <= FEE_POOL, "Invalid fee mode");
        assert(fee_fallback <= FALLBACK_VOTER, "Invalid fee fallback");
        assert(
            (signing_pubkey_x != 0) | (signing_pubkey_y != 0),
            "Signing key required",
        );
        assert(commitment != 0, "Author commitment required");
        if fee_mode == FEE_SPONSORED {
            assert(crate::sponsored_on(self.storage.next_poll_id.read()), "Sponsored fees are not available");
        }
        assert(ends_at != (0 as u64), "End is required");
        assert(ends_at > self.context.timestamp(), "End must be in the future");
        let start_base = if starts_at == (0 as u64) {
            self.context.timestamp()
        } else {
            starts_at
        };
        assert(ends_at > start_base, "End must be after start");
        assert(ends_at - start_base <= MAX_WINDOW_SECONDS, "Window exceeds 90 days");
        let day = self.context.timestamp() / SECONDS_PER_DAY;
        assert(claimed_day == (day as Field), "Wrong create day");

        let stored_next = self.storage.next_poll_id.read();
        let resolved_u64 = crate::id_counter(stored_next);
        assert(expected_id == (resolved_u64 as Field), "Poll id changed");
        let resolved = PollId::new(resolved_u64 as Field);
        assert(
            self.storage.options_count.at(resolved).is_initialized() == false,
            "Poll already exists",
        );

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
        self.storage.tally.at(resolved).at(TAG_RECIPIENT).write(self.storage.admin.read().to_field());
        self.storage.tally.at(resolved).at(TAG_SEALED_BALLOTS).write(0);
        self.storage.tally.at(resolved).at(TAG_SEALED_COUNTED).write(0);
        self.storage.vote_ended.at(resolved).write(false);
        self.storage.cancelled.at(resolved).write(false);
        self.storage.total_votes.at(resolved).write(0);
        self.storage.active_at_block.at(resolved).initialize(self.context.block_number());
        self.storage.tally.at(resolved).at(TAG_CREATOR).write(0);
        self.storage.tally.at(resolved).at(TAG_FEE).write((fee_mode + fee_fallback * 16) as Field);
        self.storage.tally.at(resolved).at(TAG_PUBX).write(signing_pubkey_x);
        self.storage.tally.at(resolved).at(TAG_PUBY).write(signing_pubkey_y);
        self.storage.tally.at(resolved).at(TAG_AUTHOR).write(commitment);
        self.storage.next_poll_id.write(crate::with_sponsored(resolved_u64 + 1, crate::sponsored_on(stored_next)));
        resolved_u64 as Field
    }

    /// Called by the hidden-author book after it proves the secret and updates the note.
    /// action 0 closes the poll. action 1 credits the poll pool.
    #[external("public")]
    fn finish_hidden_poll(poll_id: PollId, commitment: Field, action: u8, count: u64, juice: u64) {
        assert(self.msg_sender().eq(self.storage.hidden_author_book.read()), "Only hidden author book");
        self.internal.assert_poll_exists(poll_id);
        let stored = self.storage.tally.at(poll_id).at(TAG_AUTHOR).read();
        assert(stored != 0, "Poll has a public author");
        assert(stored == commitment, "Only creator");
        if action == 0 {
            self.storage.vote_ended.at(poll_id).write(true);
            let (_, pool_juice, _) = crate::unpack_pool(self.storage.tally.at(poll_id).at(TAG_POOL).read());
            if pool_juice != (0 as u64) {
                self.storage.tally.at(poll_id).at(TAG_POOL).write(crate::pack_pool(0, 0, pool_juice));
            }
        } else if action == 1 {
            assert(self.internal.poll_is_closed(poll_id) == false, "Vote has ended");
            assert(((self.storage.tally.at(poll_id).at(TAG_FEE).read() as u64) as u8) % 16 == FEE_POOL, "Poll has no pool");
            assert(count > (0 as u64), "Pool count required");
            assert(juice > (0 as u64), "Pool juice required");
            let (remaining, juice_now, refunded) = crate::unpack_pool(self.storage.tally.at(poll_id).at(TAG_POOL).read());
            self.storage.tally.at(poll_id).at(TAG_POOL).write(crate::pack_pool(remaining + count, juice_now + juice, refunded));
        } else {
            assert(false, "Unknown hidden author action");
        }
    }

    /// Credits the public pool count and the juice accounting. Does not pay the create transaction.
    #[external("public")]
    fn fund_pool(poll_id: PollId, count: u64, juice: u64) {
        self.internal.assert_poll_exists(poll_id);
        assert(self.internal.poll_is_closed(poll_id) == false, "Vote has ended");
        let payer = AztecAddress::from_field(
            self.storage.tally.at(PollId::new(0)).at(TAG_PAYER).read(),
        );
        let sender = self.msg_sender();
        assert(
            sender.eq(self.storage.admin.read())
                | ((payer.eq(AztecAddress::zero()) == false) & sender.eq(payer)),
            "Only admin or pool payer",
        );
        assert(((self.storage.tally.at(poll_id).at(TAG_FEE).read() as u64) as u8) % 16 == FEE_POOL, "Poll has no pool");
        assert(count > (0 as u64), "Pool count required");
        assert(juice > (0 as u64), "Pool juice required");
        let (remaining, juice_now, refunded) = crate::unpack_pool(self.storage.tally.at(poll_id).at(TAG_POOL).read());
        let next_count = remaining + count;
        let next_juice = juice_now + juice;
        self.storage.tally.at(poll_id).at(TAG_POOL).write(crate::pack_pool(next_count, next_juice, refunded));
    }

    /// 0 = pool can pay this cap. 1 = voter fallback. 2 = stop. Does not spend the pool.
    #[external("public")]
    #[view]
    fn quote_pool(poll_id: PollId, fee_cap: u64) -> u8 {
        assert(((self.storage.tally.at(poll_id).at(TAG_FEE).read() as u64) as u8) % 16 == FEE_POOL, "Poll has no pool");
        assert(fee_cap > (0 as u64), "Fee cap required");
        let (remaining, juice, _) = crate::unpack_pool(self.storage.tally.at(poll_id).at(TAG_POOL).read());
        if (remaining > (0 as u64)) & (juice >= fee_cap) {
            0
        } else if ((self.storage.tally.at(poll_id).at(TAG_FEE).read() as u64) as u8) / 16 == FALLBACK_VOTER {
            1
        } else {
            2
        }
    }

    /// Spends one pool ballot at `fee_cap` when the quote is 0. Only the configured payer.
    /// Returns the same codes as `quote_pool`. A miss does not decrement.
    #[external("public")]
    fn commit_pool_ballot(poll_id: PollId, fee_cap: u64) -> u8 {
        let payer = AztecAddress::from_field(
            self.storage.tally.at(PollId::new(0)).at(TAG_PAYER).read(),
        );
        assert(payer.eq(AztecAddress::zero()) == false, "Pool payer is not set");
        assert(self.msg_sender().eq(payer), "Only pool payer");
        assert(((self.storage.tally.at(poll_id).at(TAG_FEE).read() as u64) as u8) % 16 == FEE_POOL, "Poll has no pool");
        assert(fee_cap > (0 as u64), "Fee cap required");
        let (remaining, juice, _) = crate::unpack_pool(self.storage.tally.at(poll_id).at(TAG_POOL).read());
        let path = if (remaining > (0 as u64)) & (juice >= fee_cap) {
            0
        } else if ((self.storage.tally.at(poll_id).at(TAG_FEE).read() as u64) as u8) / 16 == FALLBACK_VOTER {
            1
        } else {
            2
        };
        if path == (0 as u8) {
            let next_count = remaining - 1;
            let next_juice = juice - fee_cap;
            self.storage.tally.at(poll_id).at(TAG_POOL).write(crate::pack_pool(next_count, next_juice, 0));
        }
        path
    }

    #[external("public")]
    fn set_pool_payer(payer: AztecAddress) {
        self.internal.assert_admin();
        assert(payer.eq(AztecAddress::zero()) == false, "Pool payer required");
        self.storage.tally.at(PollId::new(0)).at(TAG_PAYER).write(payer.to_field());
    }

    #[external("public")]
    fn set_allow_sponsored(allowed: bool) {
        self.internal.assert_admin();
        let stored = self.storage.next_poll_id.read();
        self.storage.next_poll_id.write(crate::with_sponsored(crate::id_counter(stored), allowed));
    }

    /// Public mark for an account that publishes polls. Not a voter identity.
    #[external("public")]
    fn set_authoritative(account: AztecAddress, enabled: bool) {
        self.internal.assert_admin();
        assert(account.eq(AztecAddress::zero()) == false, "Account required");
        self.storage.identity_claims.at(poseidon2_hash([account.to_field(), 1, 8])).write(enabled);
    }

    #[external("public")]
    #[view]
    fn is_authoritative(account: AztecAddress) -> bool {
        self.storage.identity_claims.at(poseidon2_hash([account.to_field(), 1, 8])).read()
    }

    #[external("public")]
    #[view]
    fn get_creator(poll_id: PollId) -> AztecAddress {
        self.internal.assert_poll_exists(poll_id);
        AztecAddress::from_field(self.storage.tally.at(poll_id).at(TAG_CREATOR).read())
    }

    #[external("public")]
    #[view]
    fn get_fee_mode(poll_id: PollId) -> u8 {
        ((self.storage.tally.at(poll_id).at(TAG_FEE).read() as u64) as u8) % 16
    }

    #[external("public")]
    #[view]
    fn get_pool_remaining(poll_id: PollId) -> u64 {
        let (remaining, _, _) = crate::unpack_pool(self.storage.tally.at(poll_id).at(TAG_POOL).read());
        remaining
    }

    #[external("public")]
    #[view]
    fn get_pool_juice(poll_id: PollId) -> u64 {
        let (_, juice, _) = crate::unpack_pool(self.storage.tally.at(poll_id).at(TAG_POOL).read());
        juice
    }

    #[external("public")]
    #[view]
    fn get_pool_refunded(poll_id: PollId) -> u64 {
        let (_, _, refunded) = crate::unpack_pool(self.storage.tally.at(poll_id).at(TAG_POOL).read());
        refunded
    }

    #[external("public")]
    #[view]
    fn get_signing_pubkey_x(poll_id: PollId) -> Field {
        self.storage.tally.at(poll_id).at(TAG_PUBX).read()
    }

}
