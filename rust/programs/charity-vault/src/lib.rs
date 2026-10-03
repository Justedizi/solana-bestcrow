pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
pub(crate) use instructions::claim_refund::__client_accounts_claim_refund;
pub(crate) use instructions::claim_success::__client_accounts_claim_success;
pub(crate) use instructions::create_campaign::__client_accounts_create_campaign;
pub(crate) use instructions::finalize::__client_accounts_finalize;
pub(crate) use instructions::pledge::__client_accounts_pledge;
pub(crate) use instructions::refund_all::__client_accounts_refund_all;
pub use instructions::*;
pub use state::*;

declare_id!("F1EjmWkLJRSYqzwswQCDDADPE8mXNrgiX8AEq17PBdW3");

#[program]
pub mod charity_vault {
    use super::*;

    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        campaign_id: u64,
        goal: u64,
        deadline: i64,
        desc_hash: [u8; 32],
    ) -> Result<()> {
        create_campaign::handler(ctx, campaign_id, goal, deadline, desc_hash)
    }
    pub fn pledge(ctx: Context<Pledge>, amount: u64) -> Result<()> {
        pledge::handler(ctx, amount)
    }
    pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
        finalize::handler(ctx)
    }
    pub fn claim_success(ctx: Context<ClaimSuccess>) -> Result<()> {
        claim_success::handler(ctx)
    }
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        claim_refund::handler(ctx)
    }
    pub fn refund_all<'a>(ctx: Context<'a, RefundAll<'a>>) -> Result<()> {
        refund_all::handler(ctx)
    }
}
