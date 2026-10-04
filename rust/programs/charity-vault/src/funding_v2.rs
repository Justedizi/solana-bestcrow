use anchor_lang::{prelude::*, system_program};

pub const CONFIG_SEED: &[u8] = b"config-v2";
pub const CAMPAIGN_SEED: &[u8] = b"campaign-v2";
pub const TRANCHE_SEED: &[u8] = b"tranche-v2";
pub const BACKER_SEED: &[u8] = b"backer-v2";
pub const VAULT_SEED: &[u8] = b"vault-v2";
pub const DAY: i64 = 86_400;
pub const FEE_BPS: u16 = 100;
pub const MAX_TRANCHES: usize = 5;
pub const MAX_RECIPIENTS: usize = 5;
pub const MAX_URI: usize = 200;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum FundingStatusV2 {
    Draft,
    Funding,
    Succeeded,
    Failed,
    Completed,
    Terminated,
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfigV2 {
    pub version: u8,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CampaignV2 {
    pub version: u8,
    pub creator: Pubkey,
    pub campaign_id: u64,
    pub goal: u64,
    pub funding_duration: i64,
    pub funding_deadline: i64,
    pub terms_hash: [u8; 32],
    #[max_len(MAX_URI)]
    pub terms_uri: String,
    pub status: FundingStatusV2,
    pub tranche_count: u8,
    pub shares_bps: [u16; MAX_TRANCHES],
    pub proof_periods: [i64; MAX_TRANCHES],
    pub tranche_amounts: [u64; MAX_TRANCHES],
    pub raised: u64,
    pub final_raised: u64,
    pub fee_paid: u64,
    pub net_budget: u64,
    pub settled_at: i64,
    pub first_proof_deadline: i64,
    pub current_tranche: u8,
    pub proof_deadline: i64,
    pub reserved: u64,
    pub refund_pool: u64,
    pub refunds_paid: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TrancheV2 {
    pub campaign: Pubkey,
    pub index: u8,
    pub share_bps: u16,
    pub proof_period_seconds: i64,
    pub recipient_count: u8,
    pub recipients: [Pubkey; MAX_RECIPIENTS],
    pub recipient_shares_bps: [u16; MAX_RECIPIENTS],
    pub settled: bool,
    pub status: crate::lifecycle_v2::TrancheStatusV2,
    pub round: u8,
    pub evidence_hash: [u8; 32],
    #[max_len(MAX_URI)]
    pub evidence_uri: String,
    pub vote_start: i64,
    pub vote_end: i64,
    pub revision_end: i64,
    pub approve_weight: u64,
    pub reject_weight: u64,
    pub claim_created: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct BackerLedgerV2 {
    pub campaign: Pubkey,
    pub backer: Pubkey,
    pub amount: u64,
    pub bump: u8,
}

#[error_code]
pub enum FundingErrorV2 {
    #[msg("Only the deployed program upgrade authority can initialize config")]
    UnauthorizedConfig,
    #[msg("Invalid goal, duration, allocation, recipients, or public terms")]
    InvalidTerms,
    #[msg("Campaign is in the wrong state")]
    InvalidState,
    #[msg("Funding window is closed or finalization is too early")]
    InvalidTime,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Insufficient campaign funds")]
    InsufficientFunds,
}

#[derive(Accounts)]
pub struct InitializeConfigV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [crate::ID.as_ref()], bump,
        seeds::program = anchor_lang::solana_program::bpf_loader_upgradeable::ID,
        constraint = program_data.upgrade_authority_address == Some(authority.key()) @ FundingErrorV2::UnauthorizedConfig
    )]
    pub program_data: Account<'info, ProgramData>,
    #[account(init, payer = authority, space = 8 + ProtocolConfigV2::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, ProtocolConfigV2>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_config(ctx: Context<InitializeConfigV2>, treasury: Pubkey) -> Result<()> {
    require!(treasury != Pubkey::default(), FundingErrorV2::InvalidTerms);
    ctx.accounts.config.set_inner(ProtocolConfigV2 {
        version: 2,
        treasury,
        fee_bps: FEE_BPS,
        bump: ctx.bumps.config,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(campaign_id: u64)]
pub struct CreateDraftV2<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ProtocolConfigV2>,
    #[account(init, payer = creator, space = 8 + CampaignV2::INIT_SPACE, seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign_id.to_le_bytes()], bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(init, payer = creator, space = 0, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: New program-owned zero-data campaign vault.
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_draft(
    ctx: Context<CreateDraftV2>,
    campaign_id: u64,
    goal: u64,
    duration: i64,
) -> Result<()> {
    validate_duration(duration)?;
    require!(goal > 0, FundingErrorV2::InvalidTerms);
    ctx.accounts.campaign.set_inner(CampaignV2 {
        version: 2,
        creator: ctx.accounts.creator.key(),
        campaign_id,
        goal,
        funding_duration: duration,
        funding_deadline: 0,
        terms_hash: [0; 32],
        terms_uri: String::new(),
        status: FundingStatusV2::Draft,
        tranche_count: 0,
        shares_bps: [0; MAX_TRANCHES],
        proof_periods: [0; MAX_TRANCHES],
        tranche_amounts: [0; MAX_TRANCHES],
        raised: 0,
        final_raised: 0,
        fee_paid: 0,
        net_budget: 0,
        settled_at: 0,
        first_proof_deadline: 0,
        current_tranche: 1,
        proof_deadline: 0,
        reserved: 0,
        refund_pool: 0,
        refunds_paid: 0,
        bump: ctx.bumps.campaign,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct AddTrancheV2<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, has_one = creator, seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(init, payer = creator, space = 8 + TrancheV2::INIT_SPACE, seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]], bump)]
    pub tranche: Account<'info, TrancheV2>,
    pub system_program: Program<'info, System>,
}

pub fn add_tranche(
    ctx: Context<AddTrancheV2>,
    index: u8,
    share_bps: u16,
    proof_period: i64,
    recipients: Vec<Pubkey>,
    shares: Vec<u16>,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == FundingStatusV2::Draft,
        FundingErrorV2::InvalidState
    );
    require!(
        index == campaign.tranche_count && (index as usize) < MAX_TRANCHES,
        FundingErrorV2::InvalidTerms
    );
    require!(
        (1..=5000).contains(&share_bps),
        FundingErrorV2::InvalidTerms
    );
    require!(
        (DAY..=183 * DAY).contains(&proof_period),
        FundingErrorV2::InvalidTerms
    );
    validate_recipients(&recipients, &shares)?;
    let mut payees = [Pubkey::default(); MAX_RECIPIENTS];
    let mut payee_shares = [0; MAX_RECIPIENTS];
    payees[..recipients.len()].copy_from_slice(&recipients);
    payee_shares[..shares.len()].copy_from_slice(&shares);
    ctx.accounts.tranche.set_inner(TrancheV2 {
        campaign: campaign.key(),
        index,
        share_bps,
        proof_period_seconds: proof_period,
        recipient_count: recipients.len() as u8,
        recipients: payees,
        recipient_shares_bps: payee_shares,
        settled: false,
        status: crate::lifecycle_v2::TrancheStatusV2::Pending,
        round: 1,
        evidence_hash: [0; 32],
        evidence_uri: String::new(),
        vote_start: 0,
        vote_end: 0,
        revision_end: 0,
        approve_weight: 0,
        reject_weight: 0,
        claim_created: false,
        bump: ctx.bumps.tranche,
    });
    campaign.shares_bps[index as usize] = share_bps;
    campaign.proof_periods[index as usize] = proof_period;
    campaign.tranche_count += 1;
    Ok(())
}

#[derive(Accounts)]
pub struct SealTermsV2<'info> {
    pub creator: Signer<'info>,
    #[account(mut, has_one = creator, seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
}

pub fn seal_terms(
    ctx: Context<SealTermsV2>,
    terms_hash: [u8; 32],
    terms_uri: String,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == FundingStatusV2::Draft,
        FundingErrorV2::InvalidState
    );
    validate_schedule(&campaign.shares_bps[..campaign.tranche_count as usize])?;
    require!(
        terms_hash != [0; 32]
            && terms_uri.starts_with("ar://")
            && terms_uri.len() > 5
            && terms_uri.len() <= MAX_URI,
        FundingErrorV2::InvalidTerms
    );
    campaign.funding_deadline = Clock::get()?
        .unix_timestamp
        .checked_add(campaign.funding_duration)
        .ok_or(FundingErrorV2::Overflow)?;
    campaign.terms_hash = terms_hash;
    campaign.terms_uri = terms_uri;
    campaign.status = FundingStatusV2::Funding;
    Ok(())
}

#[derive(Accounts)]
pub struct PledgeV2<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(init_if_needed, payer = backer, space = 8 + BackerLedgerV2::INIT_SPACE, seeds = [BACKER_SEED, campaign.key().as_ref(), backer.key().as_ref()], bump)]
    pub ledger: Account<'info, BackerLedgerV2>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump, owner = crate::ID)]
    /// CHECK: Campaign-derived program-owned SOL vault.
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn pledge(ctx: Context<PledgeV2>, amount: u64) -> Result<()> {
    require_funding(&ctx.accounts.campaign, Clock::get()?.unix_timestamp)?;
    require!(amount > 0, FundingErrorV2::InvalidTerms);
    let ledger = &mut ctx.accounts.ledger;
    if ledger.campaign == Pubkey::default() {
        ledger.campaign = ctx.accounts.campaign.key();
        ledger.backer = ctx.accounts.backer.key();
        ledger.amount = 0;
        ledger.bump = ctx.bumps.ledger;
    }
    require_keys_eq!(ledger.campaign, ctx.accounts.campaign.key());
    require_keys_eq!(ledger.backer, ctx.accounts.backer.key());
    ledger.amount = ledger
        .amount
        .checked_add(amount)
        .ok_or(FundingErrorV2::Overflow)?;
    ctx.accounts.campaign.raised = ctx
        .accounts
        .campaign
        .raised
        .checked_add(amount)
        .ok_or(FundingErrorV2::Overflow)?;
    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.backer.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct CancelPledgeV2<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, has_one = campaign, has_one = backer, close = backer, seeds = [BACKER_SEED, campaign.key().as_ref(), backer.key().as_ref()], bump = ledger.bump)]
    pub ledger: Account<'info, BackerLedgerV2>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump, owner = crate::ID)]
    /// CHECK: Campaign-derived program-owned SOL vault.
    pub vault: UncheckedAccount<'info>,
}

pub fn cancel_pledge(ctx: Context<CancelPledgeV2>) -> Result<()> {
    require_funding(&ctx.accounts.campaign, Clock::get()?.unix_timestamp)?;
    let amount = ctx.accounts.ledger.amount;
    ctx.accounts.campaign.raised = ctx
        .accounts
        .campaign
        .raised
        .checked_sub(amount)
        .ok_or(FundingErrorV2::Overflow)?;
    transfer_owned(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.backer.to_account_info(),
        amount,
    )
}

#[derive(Accounts)]
pub struct FinalizeFundingV2<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, ProtocolConfigV2>,
    #[account(mut, seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump, owner = crate::ID)]
    /// CHECK: Campaign-derived program-owned SOL vault.
    pub vault: UncheckedAccount<'info>,
    #[account(mut, address = config.treasury)]
    /// CHECK: Fixed configuration recipient; receives SOL only.
    pub treasury: UncheckedAccount<'info>,
}

pub fn finalize_funding(ctx: Context<FinalizeFundingV2>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == FundingStatusV2::Funding,
        FundingErrorV2::InvalidState
    );
    require!(
        now >= campaign.funding_deadline,
        FundingErrorV2::InvalidTime
    );
    campaign.final_raised = campaign.raised;
    campaign.settled_at = now;
    if campaign.raised < campaign.goal {
        campaign.status = FundingStatusV2::Failed;
    } else {
        let (fee, allocations) = allocate(
            campaign.raised,
            &campaign.shares_bps[..campaign.tranche_count as usize],
        )?;
        transfer_owned(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.treasury.to_account_info(),
            fee,
        )?;
        campaign.fee_paid = fee;
        campaign.net_budget = campaign.raised - fee;
        campaign.tranche_amounts = allocations;
        campaign.first_proof_deadline =
            now.checked_add(30 * DAY).ok_or(FundingErrorV2::Overflow)?;
        campaign.proof_deadline = campaign.first_proof_deadline;
        campaign.reserved = campaign.tranche_amounts[0];
        campaign.status = FundingStatusV2::Succeeded;
    }
    emit!(FundingFinalizedV2 {
        campaign: campaign.key(),
        final_raised: campaign.final_raised,
        fee_paid: campaign.fee_paid,
        succeeded: campaign.status == FundingStatusV2::Succeeded
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimRefundV2<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, address = ledger.backer)]
    /// CHECK: Bound to the backer; receives refund and ledger rent.
    pub backer: UncheckedAccount<'info>,
    #[account(mut, has_one = campaign, close = backer, seeds = [BACKER_SEED, campaign.key().as_ref(), backer.key().as_ref()], bump = ledger.bump)]
    pub ledger: Account<'info, BackerLedgerV2>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump, owner = crate::ID)]
    /// CHECK: Campaign-derived program-owned SOL vault.
    pub vault: UncheckedAccount<'info>,
}

pub fn claim_refund(ctx: Context<ClaimRefundV2>) -> Result<()> {
    require!(
        ctx.accounts.campaign.status == FundingStatusV2::Failed,
        FundingErrorV2::InvalidState
    );
    transfer_owned(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.backer.to_account_info(),
        ctx.accounts.ledger.amount,
    )
}

#[derive(Accounts)]
pub struct CloseBackerLedgerV2<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, address = ledger.backer)]
    /// CHECK: The backer funded this ledger and receives its rent.
    pub backer: UncheckedAccount<'info>,
    #[account(mut, has_one = campaign, close = backer, seeds = [BACKER_SEED, campaign.key().as_ref(), backer.key().as_ref()], bump = ledger.bump)]
    pub ledger: Account<'info, BackerLedgerV2>,
}

pub fn close_backer_ledger(ctx: Context<CloseBackerLedgerV2>) -> Result<()> {
    // P2 must set Completed only after all votes and tranche obligations settle.
    require!(
        ctx.accounts.campaign.status == FundingStatusV2::Completed,
        FundingErrorV2::InvalidState
    );
    Ok(())
}

#[event]
pub struct FundingFinalizedV2 {
    pub campaign: Pubkey,
    pub final_raised: u64,
    pub fee_paid: u64,
    pub succeeded: bool,
}

pub fn validate_duration(duration: i64) -> Result<()> {
    require!(
        (7 * DAY..=183 * DAY).contains(&duration),
        FundingErrorV2::InvalidTerms
    );
    Ok(())
}

pub fn validate_schedule(shares: &[u16]) -> Result<()> {
    require!(
        (2..=MAX_TRANCHES).contains(&shares.len()),
        FundingErrorV2::InvalidTerms
    );
    require!(
        shares.iter().all(|s| (1..=5000).contains(s)),
        FundingErrorV2::InvalidTerms
    );
    require!(
        shares.iter().map(|s| *s as u32).sum::<u32>() == 10_000,
        FundingErrorV2::InvalidTerms
    );
    Ok(())
}

fn validate_recipients(recipients: &[Pubkey], shares: &[u16]) -> Result<()> {
    require!(
        !recipients.is_empty()
            && recipients.len() <= MAX_RECIPIENTS
            && recipients.len() == shares.len(),
        FundingErrorV2::InvalidTerms
    );
    require!(
        shares.iter().all(|s| *s > 0) && shares.iter().map(|s| *s as u32).sum::<u32>() == 10_000,
        FundingErrorV2::InvalidTerms
    );
    for (i, key) in recipients.iter().enumerate() {
        require!(
            *key != Pubkey::default() && !recipients[..i].contains(key),
            FundingErrorV2::InvalidTerms
        );
    }
    Ok(())
}

fn require_funding(campaign: &CampaignV2, now: i64) -> Result<()> {
    require!(
        campaign.status == FundingStatusV2::Funding,
        FundingErrorV2::InvalidState
    );
    require!(now < campaign.funding_deadline, FundingErrorV2::InvalidTime);
    Ok(())
}

pub fn allocate(gross: u64, shares: &[u16]) -> Result<(u64, [u64; MAX_TRANCHES])> {
    validate_schedule(shares)?;
    let fee = ((gross as u128) * FEE_BPS as u128 / 10_000) as u64;
    let net = gross - fee;
    let mut result = [0; MAX_TRANCHES];
    let mut allocated = 0;
    for (i, share) in shares.iter().enumerate() {
        result[i] = if i + 1 == shares.len() {
            net - allocated
        } else {
            ((net as u128) * *share as u128 / 10_000) as u64
        };
        allocated += result[i];
    }
    Ok((fee, result))
}

pub(crate) fn transfer_owned(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    require!(from.key != to.key, FundingErrorV2::InvalidTerms);
    let minimum = Rent::get()?.minimum_balance(from.data_len());
    let balance = from
        .lamports()
        .checked_sub(amount)
        .ok_or(FundingErrorV2::InsufficientFunds)?;
    require!(balance >= minimum, FundingErrorV2::InsufficientFunds);
    let recipient_balance = to
        .lamports()
        .checked_add(amount)
        .ok_or(FundingErrorV2::Overflow)?;
    **from.try_borrow_mut_lamports()? = balance;
    **to.try_borrow_mut_lamports()? = recipient_balance;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedule_and_duration_boundaries() {
        for shares in [&[5000, 5000][..], &[2000, 2000, 2000, 2000, 2000][..]] {
            assert!(validate_schedule(shares).is_ok());
        }
        for shares in [
            &[10000][..],
            &[5001, 4999][..],
            &[5000, 4999][..],
            &[5000, 5000, 0][..],
            &[2000, 2000, 2000, 2000, 1000, 1000][..],
        ] {
            assert!(validate_schedule(shares).is_err());
        }
        for days in [7, 183] {
            assert!(validate_duration(days * DAY).is_ok());
        }
        for seconds in [7 * DAY - 1, 183 * DAY + 1] {
            assert!(validate_duration(seconds).is_err());
        }
    }

    #[test]
    fn allocations_conserve_lamports_and_support_overfunding() {
        for gross in [1, 99, 100, 101, 11_000_000_000, u64::MAX] {
            let (fee, tranches) = allocate(gross, &[3000, 3000, 4000]).unwrap();
            assert_eq!(fee as u128, gross as u128 / 100);
            assert_eq!(
                tranches.iter().map(|v| *v as u128).sum::<u128>() + fee as u128,
                gross as u128
            );
        }
    }

    #[test]
    fn duplicate_or_invalid_recipients_are_rejected() {
        let a = Pubkey::new_unique();
        assert!(validate_recipients(&[a], &[10000]).is_ok());
        assert!(validate_recipients(&[a, a], &[5000, 5000]).is_err());
        assert!(validate_recipients(&[a], &[9999]).is_err());
        assert!(validate_recipients(&[], &[]).is_err());
    }

    #[test]
    fn funding_rejects_drafts_and_deadline_boundary() {
        let mut campaign = CampaignV2 {
            version: 2,
            creator: Pubkey::new_unique(),
            campaign_id: 0,
            goal: 1,
            funding_duration: 7 * DAY,
            funding_deadline: 100,
            terms_hash: [1; 32],
            terms_uri: "ar://terms".into(),
            status: FundingStatusV2::Draft,
            tranche_count: 2,
            shares_bps: [5000, 5000, 0, 0, 0],
            proof_periods: [30 * DAY; MAX_TRANCHES],
            tranche_amounts: [0; 5],
            raised: 0,
            final_raised: 0,
            fee_paid: 0,
            net_budget: 0,
            settled_at: 0,
            first_proof_deadline: 0,
            current_tranche: 1,
            proof_deadline: 0,
            reserved: 0,
            refund_pool: 0,
            refunds_paid: 0,
            bump: 0,
        };
        assert!(require_funding(&campaign, 99).is_err());
        campaign.status = FundingStatusV2::Funding;
        assert!(require_funding(&campaign, 99).is_ok());
        assert!(require_funding(&campaign, 100).is_err());
        assert!(require_funding(&campaign, 101).is_err());
        campaign.status = FundingStatusV2::Succeeded;
        assert!(require_funding(&campaign, 99).is_err());
    }
}
