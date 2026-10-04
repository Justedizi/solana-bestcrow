use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::BestcrowError,
    state::{Backer, Campaign, CampaignState},
};

/// P1.5 — creator reclaims the bond when the campaign ended in a state that
/// permits it (D-003): failed goal, or a fully completed campaign. It is
/// unavailable while terminated-by-failure (forfeited) or while active.
#[derive(Accounts)]
pub struct ClaimBond<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        has_one = creator,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [BOND_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: program-owned bond vault PDA.
    pub bond: UncheckedAccount<'info>,
}

pub fn claim_bond(ctx: Context<ClaimBond>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    let claimable = matches!(campaign.state, CampaignState::Failed | CampaignState::Completed)
        && !campaign.bond_forfeited
        && !campaign.bond_settled;
    require!(claimable, BestcrowError::BondUnavailable);

    let bond = ctx.accounts.bond.to_account_info();
    let amount = bond.lamports();
    if amount > 0 {
        **bond.try_borrow_mut_lamports()? = 0;
        let creator = ctx.accounts.creator.to_account_info();
        **creator.try_borrow_mut_lamports()? = creator
            .lamports()
            .checked_add(amount)
            .ok_or(BestcrowError::ArithmeticOverflow)?;
    }
    emit!(BondReturned { campaign: campaign.key(), creator: campaign.creator, amount });
    Ok(())
}

#[event]
pub struct BondReturned {
    pub campaign: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
}

/// P1.6 — close a backer ledger after the campaign is over and return its rent
/// to the backer. Safe once no claim needs the record anymore (completed or
/// fully-refunded terminal states). The caller may be anyone; rent always goes
/// to the registered backer.
#[derive(Accounts)]
pub struct CloseBacker<'info> {
    pub caller: Signer<'info>,
    #[account(
        seeds = [CAMPAIGN_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: registered backer receiving the rent.
    #[account(mut)]
    pub backer_wallet: UncheckedAccount<'info>,
    #[account(
        mut,
        close = backer_wallet,
        seeds = [BACKER_SEED, campaign.key().as_ref(), backer_wallet.key().as_ref()],
        bump = ledger.bump
    )]
    pub ledger: Account<'info, Backer>,
}

pub fn close_backer(ctx: Context<CloseBacker>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    let ledger = &ctx.accounts.ledger;
    // Only after the campaign is finished, and only if this backer has no
    // outstanding entitlement (refund claimed, or nothing owed on failure).
    let finished = matches!(
        campaign.state,
        CampaignState::Completed | CampaignState::Failed | CampaignState::Terminated
    );
    require!(finished, BestcrowError::CampaignNotActive);
    if campaign.state == CampaignState::Failed {
        require!(ledger.refund_claimed || ledger.amount == 0, BestcrowError::RefundClaimed);
    }
    Ok(())
}
