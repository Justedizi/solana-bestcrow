use anchor_lang::{prelude::*, system_program};

use crate::{constants::*, error::CharityVaultError, state::*};

#[derive(Accounts)]
#[instruction(campaign_id: u64)]
pub struct CreateStagedCampaign<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + CampaignAccount::INIT_SPACE,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign_id.to_le_bytes()],
        bump
    )]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(init, payer = creator, space = 0, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: Program-owned vault PDA for campaign lamports.
    pub vault: UncheckedAccount<'info>,
    #[account(init, payer = creator, space = 0, seeds = [BOND_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: Program-owned bond vault PDA.
    pub bond_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

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
    require!(goal > 0, CharityVaultError::InvalidGoal);
    require!(
        base_budget > 0 && base_budget <= goal,
        CharityVaultError::InvalidGoal
    );
    require!(
        initial_tranche <= base_budget * MAX_MILESTONE_BPS / BPS_DENOM,
        CharityVaultError::MilestoneExceedsHalf
    );
    let now = Clock::get()?.unix_timestamp;
    require!(deadline > now, CharityVaultError::InvalidDeadline);

    let campaign = &mut ctx.accounts.campaign;
    campaign.creator = ctx.accounts.creator.key();
    campaign.campaign_id = campaign_id;
    campaign.goal = goal;
    campaign.deadline = deadline;
    campaign.desc_hash = desc_hash;
    campaign.raised = 0;
    campaign.paid = false;
    campaign.status = CampaignStatus::Active;
    campaign.donor_count = 0;
    campaign.donors = [Pubkey::default(); MAX_DONORS];
    campaign.bump = ctx.bumps.campaign;
    campaign.staged = true;
    campaign.base_budget = base_budget;
    campaign.initial_tranche = initial_tranche;
    campaign.released = 0;
    campaign.bond = bond;
    campaign.bond_forfeited = false;
    campaign.terminated = false;
    campaign.milestone_count = 0;
    campaign.allocated = initial_tranche;
    campaign.rejections = 0;
    campaign.refund_pool = 0;
    campaign.refunds_claimed = 0;

    if bond > 0 {
        system_program::transfer(
            CpiContext::new(
                system_program::ID,
                system_program::Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.bond_vault.to_account_info(),
                },
            ),
            bond,
        )?;
    }

    emit!(StagedCampaignCreated {
        campaign: campaign.key(),
        creator: campaign.creator,
        campaign_id,
        goal,
        deadline,
        desc_hash,
        base_budget,
        initial_tranche,
        bond,
    });
    Ok(())
}

#[event]
pub struct StagedCampaignCreated {
    pub campaign: Pubkey,
    pub creator: Pubkey,
    pub campaign_id: u64,
    pub goal: u64,
    pub deadline: i64,
    pub desc_hash: [u8; 32],
    pub base_budget: u64,
    pub initial_tranche: u64,
    pub bond: u64,
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct AddMilestone<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator,
        seeds = [CAMPAIGN_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(
        init,
        payer = creator,
        space = 8 + MilestoneAccount::INIT_SPACE,
        seeds = [MILESTONE_SEED, campaign.key().as_ref(), &[index]],
        bump
    )]
    pub milestone: Account<'info, MilestoneAccount>,
    pub system_program: Program<'info, System>,
}

pub fn add_milestone(
    ctx: Context<AddMilestone>,
    index: u8,
    amount: u64,
    deadline: i64,
    evidence_hash: [u8; 32],
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.staged, CharityVaultError::CampaignNotStaged);
    require!(
        campaign.status == CampaignStatus::Active,
        CharityVaultError::CampaignNotActive
    );
    let now = Clock::get()?.unix_timestamp;
    require!(now < campaign.deadline, CharityVaultError::DeadlinePassed);
    require!(
        index == campaign.milestone_count && MilestoneAccount::uses_index(index),
        CharityVaultError::InvalidMilestoneIndex
    );
    require!(
        amount <= campaign.base_budget * MAX_MILESTONE_BPS / BPS_DENOM,
        CharityVaultError::MilestoneExceedsHalf
    );
    let new_allocated = campaign
        .allocated
        .checked_add(amount)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;
    require!(
        new_allocated <= campaign.base_budget,
        CharityVaultError::MilestoneSumExceedsBudget
    );

    let milestone = &mut ctx.accounts.milestone;
    milestone.campaign = campaign.key();
    milestone.index = index;
    milestone.amount = amount;
    milestone.deadline = deadline;
    milestone.evidence_hash = evidence_hash;
    milestone.status = MilestoneStatus::Pending;
    milestone.approve_weight = 0;
    milestone.reject_weight = 0;
    milestone.round = 1;
    milestone.bump = ctx.bumps.milestone;

    campaign.allocated = new_allocated;
    campaign.milestone_count = campaign
        .milestone_count
        .checked_add(1)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;

    emit!(MilestoneAdded {
        campaign: campaign.key(),
        index,
        amount,
        deadline,
        evidence_hash,
    });
    Ok(())
}

#[event]
pub struct MilestoneAdded {
    pub campaign: Pubkey,
    pub index: u8,
    pub amount: u64,
    pub deadline: i64,
    pub evidence_hash: [u8; 32],
}
