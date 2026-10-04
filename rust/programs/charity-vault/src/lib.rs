pub mod constants;
pub mod error;
pub mod funding_v2;
pub mod instructions;
pub mod state;
pub(crate) use funding_v2::__client_accounts_close_backer_ledger_v2;
pub use funding_v2::CloseBackerLedgerV2;

use anchor_lang::prelude::*;
pub(crate) use funding_v2::{
    __client_accounts_add_tranche_v2, __client_accounts_cancel_pledge_v2,
    __client_accounts_claim_failed_bond_v2, __client_accounts_claim_refund_v2,
    __client_accounts_create_draft_v2, __client_accounts_finalize_funding_v2,
    __client_accounts_initialize_config_v2, __client_accounts_pledge_v2,
    __client_accounts_seal_terms_v2,
};
pub use funding_v2::{
    AddTrancheV2, CancelPledgeV2, ClaimFailedBondV2, ClaimRefundV2, CreateDraftV2,
    FinalizeFundingV2, InitializeConfigV2, PledgeV2, SealTermsV2,
};
pub(crate) use instructions::claim_refund::__client_accounts_claim_refund;
pub(crate) use instructions::claim_success::__client_accounts_claim_success;
pub(crate) use instructions::create_campaign::__client_accounts_create_campaign;
pub(crate) use instructions::finalize::__client_accounts_finalize;
pub(crate) use instructions::pledge::__client_accounts_pledge;
pub(crate) use instructions::refund_all::__client_accounts_refund_all;
pub(crate) use instructions::release::__client_accounts_release_initial;
pub(crate) use instructions::release::__client_accounts_release_tranche;
pub(crate) use instructions::release::__client_accounts_set_split;
pub(crate) use instructions::release::__client_accounts_withdraw_claim;
pub(crate) use instructions::settle::__client_accounts_claim_bond;
pub(crate) use instructions::settle::__client_accounts_claim_termination_refund;
pub(crate) use instructions::settle::__client_accounts_terminate;
pub(crate) use instructions::staged::__client_accounts_add_milestone;
pub(crate) use instructions::staged::__client_accounts_create_staged_campaign;
pub(crate) use instructions::voting::__client_accounts_finalize_vote;
pub(crate) use instructions::voting::__client_accounts_submit_evidence;
pub(crate) use instructions::voting::__client_accounts_vote_milestone;
pub use instructions::*;
pub use state::*;

declare_id!("74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG");

#[program]
pub mod charity_vault {
    use super::*;

    pub fn initialize_protocol_config_v2(
        ctx: Context<InitializeConfigV2>,
        treasury: Pubkey,
    ) -> Result<()> {
        funding_v2::initialize_config(ctx, treasury)
    }
    pub fn create_campaign_draft_v2(
        ctx: Context<CreateDraftV2>,
        campaign_id: u64,
        goal: u64,
        duration: i64,
    ) -> Result<()> {
        funding_v2::create_draft(ctx, campaign_id, goal, duration)
    }
    pub fn add_tranche_v2(
        ctx: Context<AddTrancheV2>,
        index: u8,
        share_bps: u16,
        proof_period: i64,
        recipients: Vec<Pubkey>,
        shares: Vec<u16>,
    ) -> Result<()> {
        funding_v2::add_tranche(ctx, index, share_bps, proof_period, recipients, shares)
    }
    pub fn seal_terms_v2(
        ctx: Context<SealTermsV2>,
        terms_hash: [u8; 32],
        terms_uri: String,
    ) -> Result<()> {
        funding_v2::seal_terms(ctx, terms_hash, terms_uri)
    }
    pub fn pledge_v2(ctx: Context<PledgeV2>, amount: u64) -> Result<()> {
        funding_v2::pledge(ctx, amount)
    }
    pub fn cancel_pledge_v2(ctx: Context<CancelPledgeV2>) -> Result<()> {
        funding_v2::cancel_pledge(ctx)
    }
    pub fn finalize_funding_v2(ctx: Context<FinalizeFundingV2>) -> Result<()> {
        funding_v2::finalize_funding(ctx)
    }
    pub fn claim_refund_v2(ctx: Context<ClaimRefundV2>) -> Result<()> {
        funding_v2::claim_refund(ctx)
    }
    pub fn claim_failed_bond_v2(ctx: Context<ClaimFailedBondV2>) -> Result<()> {
        funding_v2::claim_failed_bond(ctx)
    }
    pub fn claim_completed_bond_v2(ctx: Context<ClaimFailedBondV2>) -> Result<()> {
        funding_v2::claim_completed_bond(ctx)
    }
    pub fn close_backer_ledger_v2(ctx: Context<CloseBackerLedgerV2>) -> Result<()> {
        funding_v2::close_backer_ledger(ctx)
    }

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

    // ---- Bundle A: staged funding ----
    pub fn create_staged_campaign(
        ctx: Context<CreateStagedCampaign>,
        campaign_id: u64,
        goal: u64,
        deadline: i64,
        desc_hash: [u8; 32],
        base_budget: u64,
        initial_tranche: u64,
        bond: u64,
    ) -> Result<()> {
        staged::create_staged_campaign(
            ctx,
            campaign_id,
            goal,
            deadline,
            desc_hash,
            base_budget,
            initial_tranche,
            bond,
        )
    }
    pub fn add_milestone(
        ctx: Context<AddMilestone>,
        index: u8,
        amount: u64,
        deadline: i64,
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        staged::add_milestone(ctx, index, amount, deadline, evidence_hash)
    }
    pub fn submit_evidence(
        ctx: Context<SubmitEvidence>,
        index: u8,
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        voting::submit_evidence(ctx, index, evidence_hash)
    }
    pub fn vote_milestone(ctx: Context<VoteMilestone>, index: u8, approve: bool) -> Result<()> {
        voting::vote_milestone(ctx, index, approve)
    }
    pub fn finalize_vote(ctx: Context<FinalizeVote>, index: u8) -> Result<()> {
        voting::finalize_vote(ctx, index)
    }
    pub fn release_initial(ctx: Context<ReleaseInitial>) -> Result<()> {
        release::release_initial(ctx)
    }
    pub fn set_split(
        ctx: Context<SetSplit>,
        recipients: Vec<Pubkey>,
        shares_bps: Vec<u16>,
    ) -> Result<()> {
        release::set_split(ctx, recipients, shares_bps)
    }
    pub fn release_tranche(ctx: Context<ReleaseTranche>, index: u8, duration: i64) -> Result<()> {
        release::release_tranche(ctx, index, duration)
    }
    pub fn withdraw_claim<'a>(ctx: Context<'a, WithdrawClaim<'a>>, index: u8) -> Result<()> {
        release::withdraw_claim(ctx, index)
    }
    pub fn terminate(ctx: Context<Terminate>) -> Result<()> {
        settle::terminate(ctx)
    }
    pub fn claim_termination_refund<'a>(
        ctx: Context<'a, ClaimTerminationRefund<'a>>,
    ) -> Result<()> {
        settle::claim_termination_refund(ctx)
    }
    pub fn claim_bond(ctx: Context<ClaimBond>) -> Result<()> {
        settle::claim_bond(ctx)
    }
}
