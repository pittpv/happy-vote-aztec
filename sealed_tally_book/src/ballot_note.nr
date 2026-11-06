use aztec::macros::notes::note;
use protocol_types::traits::{Deserialize, Packable, Serialize};

/// One sealed ballot. The option stays in this note until the tally recipient publishes the sum.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct BallotNote {
    pub poll_id: Field,
    pub option_id: Field,
}
