use aztec::macros::notes::note;
use protocol_types::traits::{Deserialize, Packable, Serialize};

/// Up to three hidden-author polls for one account.
/// A zero poll id is an empty slot. The secret never leaves this note.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct HiddenAuthorNote {
    pub poll0: Field,
    pub poll1: Field,
    pub poll2: Field,
    pub secret0: Field,
    pub secret1: Field,
    pub secret2: Field,
}

impl HiddenAuthorNote {
    pub fn empty() -> Self {
        Self { poll0: 0, poll1: 0, poll2: 0, secret0: 0, secret1: 0, secret2: 0 }
    }

    pub fn with_poll(self, poll_id: Field, secret: Field) -> Self {
        assert(poll_id != 0, "Poll id required");
        assert(secret != 0, "Creator secret required");
        let mut note = self;
        if note.poll0 == 0 {
            note.poll0 = poll_id;
            note.secret0 = secret;
        } else if note.poll1 == 0 {
            note.poll1 = poll_id;
            note.secret1 = secret;
        } else if note.poll2 == 0 {
            note.poll2 = poll_id;
            note.secret2 = secret;
        } else {
            assert(false, "Too many open polls");
        }
        note
    }

    pub fn without_poll(self, poll_id: Field) -> Self {
        let mut note = self;
        if note.poll0 == poll_id {
            note.poll0 = 0;
            note.secret0 = 0;
        } else if note.poll1 == poll_id {
            note.poll1 = 0;
            note.secret1 = 0;
        } else if note.poll2 == poll_id {
            note.poll2 = 0;
            note.secret2 = 0;
        } else {
            assert(false, "Hidden poll not found");
        }
        note
    }

    /// Secret stored for this poll. Fails when this note does not hold the poll.
    pub fn secret_for(self, poll_id: Field) -> Field {
        if self.poll0 == poll_id {
            self.secret0
        } else if self.poll1 == poll_id {
            self.secret1
        } else if self.poll2 == poll_id {
            self.secret2
        } else {
            assert(false, "Hidden poll not found");
            0
        }
    }
}
