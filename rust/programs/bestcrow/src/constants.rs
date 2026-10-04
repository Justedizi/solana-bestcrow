use anchor_lang::prelude::*;

pub const CAMPAIGN_SEED: &[u8] = b"campaign";
pub const TRANCHE_SEED: &[u8] = b"tranche";
pub const BACKER_SEED: &[u8] = b"backer";
pub const VOTE_SEED: &[u8] = b"vote";
pub const VAULT_SEED: &[u8] = b"vault";
pub const BOND_SEED: &[u8] = b"bond";

/// Minimum and maximum tranches including the initial release (plan rule 3).
pub const MIN_TRANCHES: usize = 2;
pub const MAX_TRANCHES: usize = 5;

/// Basis-points denominator; tranche shares must sum to exactly this.
pub const BPS_DENOM: u64 = 10_000;
/// No single tranche may exceed 50% (plan rule 3).
pub const MAX_TRANCHE_BPS: u64 = 5_000;

/// Funding window bounds: 7 to 183 days (plan rule 3).
pub const MIN_FUNDING_SECS: i64 = 7 * 86_400;
pub const MAX_FUNDING_SECS: i64 = 183 * 86_400;

/// Platform fee: 1% of the final raised amount, only on success (D-003).
pub const FEE_BPS: u64 = 100;

/// Creator deposit, in lamports (D-003).
pub const BOND_LAMPORTS: u64 = 100_000_000;

/// Voting: 7 days; first failure gives 30 days to improve (plan rules 8-9).
pub const VOTE_WINDOW_SECS: i64 = 7 * 86_400;
pub const REVISION_WINDOW_SECS: i64 = 30 * 86_400;

/// Placeholder treasury for the success fee. Replace with the team's disclosed
/// address before any real deploy. Must be non-default at deploy time.
pub const TREASURY: Pubkey = pubkey!("11111111111111111111111111111111");
