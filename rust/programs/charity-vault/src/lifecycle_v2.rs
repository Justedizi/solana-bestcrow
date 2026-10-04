use crate::funding_v2::*;
use anchor_lang::{prelude::*, system_program};

pub const VOTE_SEED: &[u8] = b"vote-v2";
pub const CLAIM_SEED: &[u8] = b"claim-v2";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum TrancheStatusV2 {
    Pending,
    Voting,
    Revision,
    Approved,
    Rejected,
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecordV2 {
    pub campaign: Pubkey,
    pub tranche: Pubkey,
    pub backer: Pubkey,
    pub round: u8,
    pub approve: bool,
    pub weight: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ClaimV2 {
    pub campaign: Pubkey,
    pub tranche: Pubkey,
    pub total: u64,
    pub claimed: u64,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct SubmitEvidenceV2<'info> {
    pub creator: Signer<'info>,
    #[account(has_one = creator, seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, has_one = campaign, seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]], bump = tranche.bump)]
    pub tranche: Account<'info, TrancheV2>,
}

pub fn submit_evidence(
    ctx: Context<SubmitEvidenceV2>,
    index: u8,
    hash: [u8; 32],
    uri: String,
) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require_current(campaign, index)?;
    require!(
        hash != [0; 32] && valid_uri(&uri),
        FundingErrorV2::InvalidTerms
    );
    submit_proof(
        &mut ctx.accounts.tranche,
        campaign.proof_deadline,
        Clock::get()?.unix_timestamp,
    )?;
    ctx.accounts.tranche.evidence_hash = hash;
    ctx.accounts.tranche.evidence_uri = uri;
    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct VoteMilestoneV2<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, has_one = campaign, seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]], bump = tranche.bump)]
    pub tranche: Account<'info, TrancheV2>,
    #[account(has_one = campaign, has_one = backer, seeds = [BACKER_SEED, campaign.key().as_ref(), backer.key().as_ref()], bump = ledger.bump)]
    pub ledger: Account<'info, BackerLedgerV2>,
    #[account(init, payer = backer, space = 8 + VoteRecordV2::INIT_SPACE, seeds = [VOTE_SEED, tranche.key().as_ref(), &[tranche.round], backer.key().as_ref()], bump)]
    pub vote: Account<'info, VoteRecordV2>,
    pub system_program: Program<'info, System>,
}

pub fn vote_milestone(ctx: Context<VoteMilestoneV2>, index: u8, approve: bool) -> Result<()> {
    require_current(&ctx.accounts.campaign, index)?;
    let tranche = &mut ctx.accounts.tranche;
    require_vote_window(tranche, Clock::get()?.unix_timestamp)?;
    let weight = ctx.accounts.ledger.amount;
    require!(weight > 0, FundingErrorV2::InvalidTerms);
    let total = tranche
        .approve_weight
        .checked_add(tranche.reject_weight)
        .and_then(|n| n.checked_add(weight))
        .ok_or(FundingErrorV2::Overflow)?;
    require!(
        total <= ctx.accounts.campaign.final_raised,
        FundingErrorV2::InvalidTerms
    );
    if approve {
        tranche.approve_weight = tranche
            .approve_weight
            .checked_add(weight)
            .ok_or(FundingErrorV2::Overflow)?;
    } else {
        tranche.reject_weight = tranche
            .reject_weight
            .checked_add(weight)
            .ok_or(FundingErrorV2::Overflow)?;
    }
    ctx.accounts.vote.set_inner(VoteRecordV2 {
        campaign: ctx.accounts.campaign.key(),
        tranche: tranche.key(),
        backer: ctx.accounts.backer.key(),
        round: tranche.round,
        approve,
        weight,
        bump: ctx.bumps.vote,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct ResolveMilestoneV2<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, has_one = campaign, seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]], bump = tranche.bump)]
    pub tranche: Account<'info, TrancheV2>,
}

pub fn finalize_vote(ctx: Context<ResolveMilestoneV2>, index: u8) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require_current(campaign, index)?;
    let now = Clock::get()?.unix_timestamp;
    resolve_vote(&mut ctx.accounts.tranche, campaign.final_raised, now)?;
    if ctx.accounts.tranche.status == TrancheStatusV2::Approved {
        approve_tranche(campaign, index, now)?;
    }
    Ok(())
}

pub fn finalize_proof_timeout(ctx: Context<ResolveMilestoneV2>, index: u8) -> Result<()> {
    require_current(&ctx.accounts.campaign, index)?;
    let tranche = &mut ctx.accounts.tranche;
    let deadline = match tranche.status {
        TrancheStatusV2::Pending => ctx.accounts.campaign.proof_deadline,
        TrancheStatusV2::Revision if tranche.evidence_hash == [0; 32] => tranche.revision_end,
        _ => return err!(FundingErrorV2::InvalidState),
    };
    require!(
        Clock::get()?.unix_timestamp >= deadline,
        FundingErrorV2::InvalidTime
    );
    tranche.status = TrancheStatusV2::Rejected;
    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct ReleaseTrancheV2<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, has_one = campaign, seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]], bump = tranche.bump)]
    pub tranche: Account<'info, TrancheV2>,
    #[account(init, payer = caller, space = 8 + ClaimV2::INIT_SPACE, seeds = [CLAIM_SEED, campaign.key().as_ref(), &[index]], bump)]
    pub claim: Account<'info, ClaimV2>,
    pub system_program: Program<'info, System>,
}

pub fn release_tranche(ctx: Context<ReleaseTrancheV2>, index: u8) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(
        matches!(
            campaign.status,
            FundingStatusV2::Succeeded | FundingStatusV2::Terminated
        ),
        FundingErrorV2::InvalidState
    );
    let tranche = &mut ctx.accounts.tranche;
    require_releasable(tranche, index, campaign.tranche_count)?;
    tranche.claim_created = true;
    if index == 0 {
        tranche.status = TrancheStatusV2::Approved;
    }
    ctx.accounts.claim.set_inner(ClaimV2 {
        campaign: campaign.key(),
        tranche: tranche.key(),
        total: campaign.tranche_amounts[index as usize],
        claimed: 0,
        bump: ctx.bumps.claim,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct WithdrawClaimV2<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, has_one = campaign, seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]], bump = tranche.bump)]
    pub tranche: Account<'info, TrancheV2>,
    #[account(mut, has_one = campaign, has_one = tranche, seeds = [CLAIM_SEED, campaign.key().as_ref(), &[index]], bump = claim.bump)]
    pub claim: Account<'info, ClaimV2>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump, owner = crate::ID)]
    /// CHECK: Campaign vault, validated by seeds and program ownership.
    pub vault: UncheckedAccount<'info>,
}

pub fn withdraw_claim<'a>(ctx: Context<'a, WithdrawClaimV2<'a>>, index: u8) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        matches!(
            campaign.status,
            FundingStatusV2::Succeeded | FundingStatusV2::Terminated
        ),
        FundingErrorV2::InvalidState
    );
    let tranche = &mut ctx.accounts.tranche;
    require!(
        tranche.index == index && tranche.status == TrancheStatusV2::Approved && !tranche.settled,
        FundingErrorV2::InvalidState
    );
    require!(
        ctx.accounts.claim.claimed == 0
            && ctx.accounts.claim.total == campaign.tranche_amounts[index as usize],
        FundingErrorV2::InvalidTerms
    );
    let count = tranche.recipient_count as usize;
    validate_payees(tranche, ctx.remaining_accounts)?;
    let shares = split_amount(
        ctx.accounts.claim.total,
        &tranche.recipient_shares_bps[..count],
    )?;
    for (recipient, amount) in ctx.remaining_accounts.iter().zip(shares.iter()) {
        if *amount > 0 {
            transfer_owned(&ctx.accounts.vault.to_account_info(), recipient, *amount)?;
        }
    }
    campaign.reserved = campaign
        .reserved
        .checked_sub(ctx.accounts.claim.total)
        .ok_or(FundingErrorV2::Overflow)?;
    ctx.accounts.claim.claimed = ctx.accounts.claim.total;
    tranche.settled = true;
    if campaign.status == FundingStatusV2::Succeeded
        && campaign.current_tranche == campaign.tranche_count
        && campaign.reserved == 0
    {
        campaign.status = FundingStatusV2::Completed;
        campaign.settled_at = Clock::get()?.unix_timestamp;
    }
    // Keep the claim and durable tranche marker; closing either must never re-enable payment.
    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct TerminateV2<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(has_one = campaign, seeds = [TRANCHE_SEED, campaign.key().as_ref(), &[index]], bump = tranche.bump)]
    pub tranche: Account<'info, TrancheV2>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump, owner = crate::ID)]
    /// CHECK: Campaign vault, validated by seeds and owner.
    pub vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [BOND_SEED, campaign.key().as_ref()], bump, owner = crate::ID)]
    /// CHECK: Deposit vault, validated by seeds and owner.
    pub bond_vault: UncheckedAccount<'info>,
}

pub fn terminate(ctx: Context<TerminateV2>, index: u8) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == FundingStatusV2::Succeeded,
        FundingErrorV2::InvalidState
    );
    let voluntary = ctx.accounts.caller.key() == campaign.creator;
    if !voluntary {
        require!(
            index == campaign.current_tranche
                && ctx.accounts.tranche.status == TrancheStatusV2::Rejected,
            FundingErrorV2::InvalidState
        );
    }
    require!(!campaign.bond_claimed, FundingErrorV2::BondUnavailable);
    transfer_owned(
        &ctx.accounts.bond_vault.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        BOND,
    )?;
    campaign.bond_claimed = true;
    let rent = Rent::get()?.minimum_balance(ctx.accounts.vault.data_len());
    campaign.refund_pool =
        refund_available(ctx.accounts.vault.lamports(), rent, campaign.reserved)?;
    campaign.refunds_paid = 0;
    campaign.status = FundingStatusV2::Terminated;
    campaign.settled_at = Clock::get()?.unix_timestamp;
    Ok(())
}

#[derive(Accounts)]
pub struct ReturnFundsV2<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(has_one = creator, seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump, owner = crate::ID)]
    /// CHECK: Campaign vault receives voluntary creator funding before termination.
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn return_funds(ctx: Context<ReturnFundsV2>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.campaign.status == FundingStatusV2::Succeeded && amount > 0,
        FundingErrorV2::InvalidState
    );
    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )
}

#[derive(Accounts)]
pub struct TerminationRefundV2<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, address = ledger.backer)]
    /// CHECK: Refund and ledger rent are bound to the recorded backer.
    pub backer: UncheckedAccount<'info>,
    #[account(mut, has_one = campaign, close = backer, seeds = [BACKER_SEED, campaign.key().as_ref(), backer.key().as_ref()], bump = ledger.bump)]
    pub ledger: Account<'info, BackerLedgerV2>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump, owner = crate::ID)]
    /// CHECK: Campaign vault, validated by seeds and owner.
    pub vault: UncheckedAccount<'info>,
}

pub fn termination_refund(ctx: Context<TerminationRefundV2>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == FundingStatusV2::Terminated,
        FundingErrorV2::InvalidState
    );
    let share = refund_share(
        ctx.accounts.ledger.amount,
        campaign.refund_pool,
        campaign.final_raised,
    )?;
    let paid = campaign
        .refunds_paid
        .checked_add(share)
        .ok_or(FundingErrorV2::Overflow)?;
    require!(
        paid <= campaign.refund_pool,
        FundingErrorV2::InsufficientFunds
    );
    let rent = Rent::get()?.minimum_balance(ctx.accounts.vault.data_len());
    require!(
        refund_available(ctx.accounts.vault.lamports(), rent, campaign.reserved)? >= share,
        FundingErrorV2::InsufficientFunds
    );
    if share > 0 {
        transfer_owned(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.backer.to_account_info(),
            share,
        )?;
    }
    campaign.refunds_paid = paid;
    Ok(())
}

fn valid_uri(uri: &str) -> bool {
    uri.len() > 5 && uri.len() <= MAX_URI && uri.starts_with("ar://")
}

pub fn require_current(campaign: &CampaignV2, index: u8) -> Result<()> {
    require!(
        campaign.status == FundingStatusV2::Succeeded
            && index == campaign.current_tranche
            && index > 0
            && index < campaign.tranche_count,
        FundingErrorV2::InvalidState
    );
    Ok(())
}

pub fn submit_proof(tranche: &mut TrancheV2, deadline: i64, now: i64) -> Result<()> {
    match tranche.status {
        TrancheStatusV2::Pending => {
            require!(now < deadline, FundingErrorV2::InvalidTime);
            tranche.vote_start = now;
            tranche.vote_end = now.checked_add(7 * DAY).ok_or(FundingErrorV2::Overflow)?;
            tranche.status = TrancheStatusV2::Voting;
        }
        TrancheStatusV2::Revision => {
            require!(
                now < tranche.revision_end && tranche.evidence_hash == [0; 32],
                FundingErrorV2::InvalidTime
            );
            tranche.vote_start = tranche.revision_end;
            tranche.vote_end = tranche
                .revision_end
                .checked_add(7 * DAY)
                .ok_or(FundingErrorV2::Overflow)?;
            tranche.status = TrancheStatusV2::Voting;
        }
        _ => return err!(FundingErrorV2::InvalidState),
    }
    Ok(())
}

pub fn require_vote_window(tranche: &TrancheV2, now: i64) -> Result<()> {
    require!(
        tranche.status == TrancheStatusV2::Voting,
        FundingErrorV2::InvalidState
    );
    require!(
        now >= tranche.vote_start && now < tranche.vote_end,
        FundingErrorV2::InvalidTime
    );
    Ok(())
}

pub fn resolve_vote(tranche: &mut TrancheV2, raised: u64, now: i64) -> Result<()> {
    require!(
        tranche.status == TrancheStatusV2::Voting && raised > 0,
        FundingErrorV2::InvalidState
    );
    require!(now >= tranche.vote_end, FundingErrorV2::InvalidTime);
    require!(
        (tranche.approve_weight as u128) + tranche.reject_weight as u128 <= raised as u128,
        FundingErrorV2::InvalidTerms
    );
    if (tranche.approve_weight as u128) * 2 > raised as u128 {
        tranche.status = TrancheStatusV2::Approved;
    } else if tranche.round == 1 {
        tranche.round = 2;
        tranche.status = TrancheStatusV2::Revision;
        tranche.revision_end = now.checked_add(30 * DAY).ok_or(FundingErrorV2::Overflow)?;
        tranche.evidence_hash = [0; 32];
        tranche.evidence_uri.clear();
        tranche.approve_weight = 0;
        tranche.reject_weight = 0;
    } else {
        tranche.status = TrancheStatusV2::Rejected;
    }
    Ok(())
}

pub fn approve_tranche(campaign: &mut CampaignV2, index: u8, now: i64) -> Result<()> {
    require_current(campaign, index)?;
    campaign.reserved = campaign
        .reserved
        .checked_add(campaign.tranche_amounts[index as usize])
        .ok_or(FundingErrorV2::Overflow)?;
    campaign.current_tranche += 1;
    if campaign.current_tranche < campaign.tranche_count {
        campaign.proof_deadline = now
            .checked_add(campaign.proof_periods[campaign.current_tranche as usize])
            .ok_or(FundingErrorV2::Overflow)?;
    }
    Ok(())
}

pub fn require_releasable(tranche: &TrancheV2, index: u8, count: u8) -> Result<()> {
    require!(
        index < count && tranche.index == index && !tranche.claim_created && !tranche.settled,
        FundingErrorV2::InvalidState
    );
    require!(
        index == 0 || tranche.status == TrancheStatusV2::Approved,
        FundingErrorV2::InvalidState
    );
    Ok(())
}

fn validate_payees(tranche: &TrancheV2, payees: &[AccountInfo]) -> Result<()> {
    let count = tranche.recipient_count as usize;
    require!(
        count > 0 && count <= MAX_RECIPIENTS && payees.len() == count,
        FundingErrorV2::InvalidTerms
    );
    for (i, payee) in payees.iter().enumerate() {
        require!(
            payee.is_writable && *payee.key == tranche.recipients[i],
            FundingErrorV2::InvalidTerms
        );
    }
    Ok(())
}

pub fn split_amount(total: u64, shares: &[u16]) -> Result<Vec<u64>> {
    require!(
        !shares.is_empty()
            && shares.iter().all(|v| *v > 0)
            && shares.iter().map(|v| *v as u32).sum::<u32>() == 10_000,
        FundingErrorV2::InvalidTerms
    );
    let mut amounts = Vec::with_capacity(shares.len());
    let mut distributed = 0;
    for (i, share) in shares.iter().enumerate() {
        let amount = if i + 1 == shares.len() {
            total - distributed
        } else {
            ((total as u128) * *share as u128 / 10_000) as u64
        };
        amounts.push(amount);
        distributed += amount;
    }
    Ok(amounts)
}

pub fn refund_available(balance: u64, rent: u64, reserved: u64) -> Result<u64> {
    balance
        .checked_sub(rent)
        .and_then(|n| n.checked_sub(reserved))
        .ok_or_else(|| error!(FundingErrorV2::InsufficientFunds))
}

pub fn refund_share(weight: u64, pool: u64, raised: u64) -> Result<u64> {
    require!(raised > 0 && weight <= raised, FundingErrorV2::InvalidTerms);
    Ok(((weight as u128) * pool as u128 / raised as u128) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tranche(status: TrancheStatusV2, round: u8) -> TrancheV2 {
        TrancheV2 {
            campaign: Pubkey::new_unique(),
            index: 1,
            share_bps: 5000,
            proof_period_seconds: 30 * DAY,
            recipient_count: 1,
            recipients: [
                Pubkey::new_unique(),
                Pubkey::default(),
                Pubkey::default(),
                Pubkey::default(),
                Pubkey::default(),
            ],
            recipient_shares_bps: [10_000, 0, 0, 0, 0],
            settled: false,
            status,
            round,
            evidence_hash: [0; 32],
            evidence_uri: String::new(),
            vote_start: 0,
            vote_end: 0,
            revision_end: 0,
            approve_weight: 0,
            reject_weight: 0,
            claim_created: false,
            bump: 0,
        }
    }

    #[test]
    fn vote_window_and_strict_half_boundary() {
        let mut t = tranche(TrancheStatusV2::Pending, 1);
        submit_proof(&mut t, 1_000, 999).unwrap();
        assert!(require_vote_window(&t, t.vote_start).is_ok());
        assert!(require_vote_window(&t, t.vote_end).is_err());
        t.approve_weight = 50;
        t.reject_weight = 0;
        let vote_end = t.vote_end;
        assert!(resolve_vote(&mut t, 100, vote_end).is_ok());
        assert_eq!(t.status, TrancheStatusV2::Revision);
        assert_eq!(t.revision_end, t.vote_end + 30 * DAY);
    }

    #[test]
    fn approval_requires_more_than_half_and_second_failure_rejects() {
        let mut t = tranche(TrancheStatusV2::Voting, 1);
        t.vote_start = 0;
        t.vote_end = 10;
        t.approve_weight = 51;
        assert!(resolve_vote(&mut t, 100, 10).is_ok());
        assert_eq!(t.status, TrancheStatusV2::Approved);

        let mut second = tranche(TrancheStatusV2::Voting, 2);
        second.vote_end = 10;
        second.approve_weight = 50;
        assert!(resolve_vote(&mut second, 100, 10).is_ok());
        assert_eq!(second.status, TrancheStatusV2::Rejected);
    }

    #[test]
    fn proof_timeout_and_split_conserve_amount() {
        let mut t = tranche(TrancheStatusV2::Pending, 1);
        assert!(submit_proof(&mut t, 100, 100).is_err());
        assert_eq!(split_amount(101, &[6000, 4000]).unwrap(), vec![60, 41]);
        assert!(refund_share(101, 101, 100).is_err());
        assert_eq!(refund_share(50, 101, 100).unwrap(), 50);
    }
}
