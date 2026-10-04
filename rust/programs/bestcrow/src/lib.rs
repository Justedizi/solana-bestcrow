pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
pub(crate) use instructions::bond::{__client_accounts_claim_bond, __client_accounts_close_backer};
pub(crate) use instructions::campaign::{
    __client_accounts_add_tranche, __client_accounts_create_draft, __client_accounts_seal_terms,
};
pub(crate) use instructions::funding::{__client_accounts_cancel_pledge, __client_accounts_pledge};
pub(crate) use instructions::settlement::{
    __client_accounts_finalize_funding, __client_accounts_refund_for,
};
pub use instructions::*;
pub use state::*;

declare_id!("3jGgPRa4gH25wfL49E3TAtpix5ePUZKWrQLT83eNZBVr");

#[program]
pub mod bestcrow {
    use super::*;

    /// P1.1 — create a draft campaign (no funds). Terms are sealed later.
    pub fn create_draft(
        ctx: Context<CreateDraft>,
        campaign_id: u64,
        goal: u64,
        terms_hash: [u8; 32],
        content_uri: u32,
    ) -> Result<()> {
        campaign::create_draft(ctx, campaign_id, goal, terms_hash, content_uri)
    }

    /// P1.1 — add a tranche to a draft (share <= 50%).
    pub fn add_tranche(
        ctx: Context<AddTranche>,
        index: u8,
        share_bps: u16,
        work_period: i64,
    ) -> Result<()> {
        campaign::add_tranche(ctx, index, share_bps, work_period)
    }

    /// P1.1 — validate the schedule and open funding; funds the 0.1 SOL bond.
    pub fn seal_terms<'info>(
        ctx: Context<'info, SealTerms<'info>>,
        funding_secs: i64,
        terms_hash: [u8; 32],
    ) -> Result<()> {
        campaign::seal_terms(ctx, funding_secs, terms_hash)
    }

    /// P1.2 — pledge during funding (overfunding allowed).
    pub fn pledge(ctx: Context<Pledge>, amount: u64) -> Result<()> {
        funding::pledge(ctx, amount)
    }

    /// P1.2 — cancel the full pledge while funding is open.
    pub fn cancel_pledge(ctx: Context<CancelPledge>) -> Result<()> {
        funding::cancel_pledge(ctx)
    }

    /// P1.4 — finalize funding: freeze raised, charge 1% once on success,
    /// reserve tranche amounts, or mark failed (no fee).
    pub fn finalize_funding<'info>(
        ctx: Context<'info, FinalizeFunding<'info>>,
    ) -> Result<()> {
        settlement::finalize_funding(ctx)
    }

    /// P1.3 — permissionless 100% refund after a failed goal.
    pub fn refund_for(ctx: Context<RefundFor>) -> Result<()> {
        settlement::refund_for(ctx)
    }

    /// P1.5 — reclaim the bond after a failed or fully completed campaign.
    pub fn claim_bond(ctx: Context<ClaimBond>) -> Result<()> {
        bond::claim_bond(ctx)
    }

    /// P1.6 — close a finished backer ledger and return its rent.
    pub fn close_backer(ctx: Context<CloseBacker>) -> Result<()> {
        bond::close_backer(ctx)
    }
}
