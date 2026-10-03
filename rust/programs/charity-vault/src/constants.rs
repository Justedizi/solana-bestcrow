pub const CAMPAIGN_SEED: &[u8] = b"campaign";
pub const DONOR_SEED: &[u8] = b"donor";
pub const VAULT_SEED: &[u8] = b"vault";

/// Maximum number of distinct donors per campaign.
///
/// Capped at 12 so the batched `refund_all` instruction stays inside the
/// 1232-byte legacy transaction limit. That instruction needs two remaining
/// accounts per donor (the ledger and the recipient) on top of its fixed
/// accounts; including compute-budget instructions and a possible second
/// signer, 12 donors serialize to roughly 1100 bytes. Raising this limit
/// requires sending a v0/v1 transaction with an address lookup table or adding
/// a paginated refund instruction.
pub const MAX_DONORS: usize = 12;
pub const MAX_DESCRIPTION_HASH_LEN: usize = 32;
