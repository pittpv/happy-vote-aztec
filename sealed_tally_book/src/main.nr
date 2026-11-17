// SealedTallyBook — homomorphic tallies for a sealed HappyVote poll.
//
// Each ballot adds an exponential ElGamal ciphertext to every option. The public
// call records that a ballot was accepted and does not receive the option. After
// publish_at, one proof decrypts the aggregate. Individual ballots are not stored.

mod elgamal;
mod test;

use aztec::macros::aztec;
use sha256;

global SEALED_KEY_DOMAIN: Field = 0x48565f534b;

#[aztec]
pub contract SealedTallyBook {
    use aztec::macros::{functions::{external, initializer, internal, view}, storage::storage};
    use aztec::protocol::address::AztecAddress;
    use aztec::protocol::traits::ToField;
    use aztec::state_vars::{Map, PublicImmutable, PublicMutable};
    use crate::elgamal::{
        add, decode, decrypt_matches, encode_x, encode_y, encrypt, generator, mul, same_point,
    };
    use aztec::protocol::hash::poseidon2_hash;
    use happy_vote_aztec::HappyVote;
    use happy_vote_aztec::u128_pair_to_be_bytes;

    global MAX_SEALED_OPTIONS: u32 = 8;

    #[storage]
    struct Storage<Context> {
        admin: PublicImmutable<AztecAddress, Context>,
        happy_vote: PublicImmutable<AztecAddress, Context>,
        reg_x_hi: PublicImmutable<u128, Context>,
        reg_x_lo: PublicImmutable<u128, Context>,
        reg_y_hi: PublicImmutable<u128, Context>,
        reg_y_lo: PublicImmutable<u128, Context>,
        pk_x: Map<Field, PublicMutable<Field, Context>, Context>,
        pk_y: Map<Field, PublicMutable<Field, Context>, Context>,
        blob: Map<Field, PublicMutable<Field, Context>, Context>,
        /// 8 options × (c1.x, c1.y, c2.x, c2.y). (0, 0) is the point at infinity.
        points: Map<Field, Map<Field, PublicMutable<Field, Context>, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(happy_vote: AztecAddress) {
        assert(happy_vote.eq(AztecAddress::zero()) == false, "HappyVote required");
        self.storage.admin.initialize(self.msg_sender());
        self.storage.happy_vote.initialize(happy_vote);
    }

    #[external("public")]
    fn set_registrar(x_hi: u128, x_lo: u128, y_hi: u128, y_lo: u128) {
        assert(self.msg_sender().eq(self.storage.admin.read()), "Only admin");
        assert((x_hi != 0) | (x_lo != 0), "Registrar required");
        self.storage.reg_x_hi.initialize(x_hi);
        self.storage.reg_x_lo.initialize(x_lo);
        self.storage.reg_y_hi.initialize(y_hi);
        self.storage.reg_y_lo.initialize(y_lo);
    }

    /// Test and unlocked deploys. Once the registrar is set, only a signed bind works.
    #[external("public")]
    fn store_key_admin(poll_id: Field, pk_x: Field, pk_y: Field) {
        assert(self.msg_sender().eq(self.storage.admin.read()), "Only admin");
        assert(self.storage.reg_x_hi.is_initialized() == false, "Registrar signs sealed keys");
        self.internal.write_key(poll_id, pk_x, pk_y, 0);
    }

    /// The poll creator binds the server's key. The signature is under the registrar key.
    #[external("private")]
    fn bind_key(
        poll_id: Field,
        pk_x: Field,
        pk_y: Field,
        blob_hash: Field,
        publish_at: u64,
        sig_r: [u8; 32],
        sig_s: [u8; 32],
    ) {
        let _registrar = self.storage.reg_x_hi.read();
        self.internal.assert_key_signature(poll_id, pk_x, pk_y, blob_hash, publish_at, sig_r, sig_s);
        let creator = self.msg_sender().to_field();
        self.enqueue(SealedTallyBook::at(self.address).store_key(poll_id, pk_x, pk_y, blob_hash));
        let happy = self.storage.happy_vote.read();
        self.enqueue(HappyVote::at(happy).attach_sealed_key(HappyVote::PollId::new(poll_id), creator));
    }

    /// Hidden author. `secret` is the note secret; the contract stores only the commitment.
    #[external("private")]
    fn bind_hidden_key(
        poll_id: Field,
        secret: Field,
        pk_x: Field,
        pk_y: Field,
        blob_hash: Field,
        publish_at: u64,
        sig_r: [u8; 32],
        sig_s: [u8; 32],
    ) {
        assert(secret != 0, "Creator secret required");
        let _registrar = self.storage.reg_x_hi.read();
        self.internal.assert_key_signature(poll_id, pk_x, pk_y, blob_hash, publish_at, sig_r, sig_s);
        let commitment = poseidon2_hash([secret, poll_id, 9]);
        self.enqueue(SealedTallyBook::at(self.address).store_key(poll_id, pk_x, pk_y, blob_hash));
        let happy = self.storage.happy_vote.read();
        self.enqueue(HappyVote::at(happy).attach_sealed_key(HappyVote::PollId::new(poll_id), commitment));
    }

    #[external("public")]
    fn store_key(poll_id: Field, pk_x: Field, pk_y: Field, blob_hash: Field) {
        assert(self.msg_sender().eq(self.address), "Only sealed tally book");
        self.internal.write_key(poll_id, pk_x, pk_y, blob_hash);
    }

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
        randomness: [Field; 8],
        old_points: [Field; 32],
        pk_x: Field,
        pk_y: Field,
    ) {
        let happy = self.storage.happy_vote.read();
        let poll = HappyVote::PollId::new(poll_id);
        let option_u32 = option_id as u32;
        assert(option_id == (option_u32 as Field), "Invalid option");
        assert(options_count >= 2, "Need at least 2 options");
        assert(options_count <= MAX_SEALED_OPTIONS, "Sealed poll allows 8 options");
        assert(option_u32 < options_count, "Invalid option");
        assert(pk_x != 0, "Sealed key required");
        let pk = decode(pk_x, pk_y);
        let mut new_points: [Field; 32] = [0; 32];
        for i in 0..8 {
            let base = i * 4;
            let old_c1 = decode(old_points[base], old_points[base + 1]);
            let old_c2 = decode(old_points[base + 2], old_points[base + 3]);
            if (i as u32) < options_count {
                assert(randomness[i] != 0, "Ballot randomness required");
                let bit = if (i as u32) == option_u32 { 1 } else { 0 };
                let (delta_c1, delta_c2) = encrypt(bit, randomness[i], pk);
                let c1 = add(old_c1, delta_c1);
                let c2 = add(old_c2, delta_c2);
                new_points[base] = encode_x(c1);
                new_points[base + 1] = encode_y(c1);
                new_points[base + 2] = encode_x(c2);
                new_points[base + 3] = encode_y(c2);
            } else {
                assert(randomness[i] == 0, "Invalid option");
                new_points[base] = old_points[base];
                new_points[base + 1] = old_points[base + 1];
                new_points[base + 2] = old_points[base + 2];
                new_points[base + 3] = old_points[base + 3];
            }
        }
        self.enqueue(
            SealedTallyBook::at(self.address).apply_ciphertext(poll_id, pk_x, pk_y, old_points, new_points),
        );
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

    #[external("public")]
    fn apply_ciphertext(
        poll_id: Field,
        pk_x: Field,
        pk_y: Field,
        old_points: [Field; 32],
        new_points: [Field; 32],
    ) {
        assert(self.msg_sender().eq(self.address), "Only sealed tally book");
        assert(self.storage.pk_x.at(poll_id).read() == pk_x, "Sealed key mismatch");
        assert(self.storage.pk_y.at(poll_id).read() == pk_y, "Sealed key mismatch");
        for i in 0..32 {
            let slot = i as Field;
            assert(self.storage.points.at(poll_id).at(slot).read() == old_points[i], "Tally changed");
            self.storage.points.at(poll_id).at(slot).write(new_points[i]);
        }
    }

    /// One publication. `counts` is the plaintext tally. Repeat calls cannot add another page.
    #[external("private")]
    fn publish(
        poll_id: Field,
        sk: Field,
        counts: [Field; 8],
        points: [Field; 32],
        recipient: AztecAddress,
        pk_x: Field,
        pk_y: Field,
    ) {
        assert(sk != 0, "Sealed key required");
        let pk = decode(pk_x, pk_y);
        assert(same_point(pk, mul(generator(), sk)), "Sealed key mismatch");
        let mut wide: [Field; 32] = [0; 32];
        let mut batch = 0;
        for i in 0..8 {
            let base = i * 4;
            let c1 = decode(points[base], points[base + 1]);
            let c2 = decode(points[base + 2], points[base + 3]);
            assert(decrypt_matches(c1, c2, sk, counts[i]), "Sealed tally mismatch");
            wide[i] = counts[i];
            batch = batch + counts[i];
        }
        let batch_u64 = batch as u64;
        assert((batch_u64 as Field) == batch, "Sealed tally overcounted");
        self.enqueue(SealedTallyBook::at(self.address).assert_points(poll_id, pk_x, pk_y, points));
        let happy = self.storage.happy_vote.read();
        self.enqueue(HappyVote::at(happy).publish_sealed_tally(
            HappyVote::PollId::new(poll_id),
            wide,
            batch_u64,
            recipient,
        ));
    }

    #[external("public")]
    fn assert_points(poll_id: Field, pk_x: Field, pk_y: Field, points: [Field; 32]) {
        assert(self.msg_sender().eq(self.address), "Only sealed tally book");
        assert(self.storage.pk_x.at(poll_id).read() == pk_x, "Sealed key mismatch");
        assert(self.storage.pk_y.at(poll_id).read() == pk_y, "Sealed key mismatch");
        for i in 0..32 {
            assert(
                self.storage.points.at(poll_id).at(i as Field).read() == points[i],
                "Tally changed",
            );
        }
    }

    #[external("public")]
    #[view]
    fn get_ciphertext(poll_id: Field) -> [Field; 32] {
        let mut points: [Field; 32] = [0; 32];
        for i in 0..32 {
            points[i] = self.storage.points.at(poll_id).at(i as Field).read();
        }
        points
    }

    #[external("public")]
    #[view]
    fn get_key_x(poll_id: Field) -> Field {
        self.storage.pk_x.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_key_y(poll_id: Field) -> Field {
        self.storage.pk_y.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_blob_hash(poll_id: Field) -> Field {
        self.storage.blob.at(poll_id).read()
    }

    #[external("public")]
    #[view]
    fn get_happy_vote() -> AztecAddress {
        self.storage.happy_vote.read()
    }

    #[internal("private")]
    fn assert_key_signature(
        poll_id: Field,
        pk_x: Field,
        pk_y: Field,
        blob_hash: Field,
        publish_at: u64,
        sig_r: [u8; 32],
        sig_s: [u8; 32],
    ) {
        let digest = crate::key_digest(poll_id, pk_x, pk_y, blob_hash, publish_at);
        let mut signature: [u8; 64] = [0; 64];
        for i in 0..32 {
            signature[i] = sig_r[i];
            signature[32 + i] = sig_s[i];
        }
        let ok = std::ecdsa_secp256k1::verify_signature(
            u128_pair_to_be_bytes(self.storage.reg_x_hi.read(), self.storage.reg_x_lo.read()),
            u128_pair_to_be_bytes(self.storage.reg_y_hi.read(), self.storage.reg_y_lo.read()),
            signature,
            digest,
        );
        assert(ok, "Sealed key rejected");
    }

    #[internal("public")]
    fn write_key(poll_id: Field, pk_x: Field, pk_y: Field, blob_hash: Field) {
        assert(self.storage.pk_x.at(poll_id).read() == 0, "Sealed key already set");
        assert(pk_x != 0, "Sealed key required");
        self.storage.pk_x.at(poll_id).write(pk_x);
        self.storage.pk_y.at(poll_id).write(pk_y);
        self.storage.blob.at(poll_id).write(blob_hash);
    }
}

fn key_digest(poll_id: Field, pk_x: Field, pk_y: Field, blob_hash: Field, publish_at: u64) -> [u8; 32] {
    let mut message: [u8; 192] = [0; 192];
    let poll_bytes: [u8; 32] = poll_id.to_be_bytes();
    let x_bytes: [u8; 32] = pk_x.to_be_bytes();
    let y_bytes: [u8; 32] = pk_y.to_be_bytes();
    let blob_bytes: [u8; 32] = blob_hash.to_be_bytes();
    let time_bytes: [u8; 32] = (publish_at as Field).to_be_bytes();
    let domain_bytes: [u8; 32] = SEALED_KEY_DOMAIN.to_be_bytes();
    for i in 0..32 {
        message[i] = poll_bytes[i];
        message[32 + i] = x_bytes[i];
        message[64 + i] = y_bytes[i];
        message[96 + i] = blob_bytes[i];
        message[128 + i] = time_bytes[i];
        message[160 + i] = domain_bytes[i];
    }
    sha256::digest(message)
}
