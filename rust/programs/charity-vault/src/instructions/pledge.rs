use anchor_lang::{prelude::*, system_program};

use crate::{constants::*, error::CharityVaultError, state::*};

#[derive(Accounts)]
pub struct Pledge<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,
    #[account(mut)]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(
        init_if_needed,
        payer = donor,
        space = 8 + DonorLedgerAccount::INIT_SPACE,
        seeds = [DONOR_SEED, campaign.key().as_ref(), donor.key().as_ref()],
        bump
    )]
    pub ledger: Account<'info, DonorLedgerAccount>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: This PDA is derived from the campaign and only stores campaign lamports.
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Pledge>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Active,
        CharityVaultError::CampaignNotActive
    );
    require!(now < campaign.deadline, CharityVaultError::DeadlinePassed);
    require!(amount > 0, CharityVaultError::InvalidGoal);

    let new_raised = campaign
        .raised
        .checked_add(amount)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;
    require!(new_raised <= campaign.goal, CharityVaultError::GoalOverflow);

    let ledger = &mut ctx.accounts.ledger;
    if ledger.campaign == Pubkey::default() {
        ledger.campaign = campaign.key();
        ledger.donor = ctx.accounts.donor.key();
        ledger.amount = 0;
        ledger.claimed = false;
        ledger.bump = ctx.bumps.ledger;
        require!(
            (campaign.donor_count as usize) < MAX_DONORS,
            CharityVaultError::DonorRegistryFull
        );
        let donor_index = campaign.donor_count as usize;
        campaign.donors[donor_index] = ctx.accounts.donor.key();
        campaign.donor_count = campaign
            .donor_count
            .checked_add(1)
            .ok_or(CharityVaultError::ArithmeticOverflow)?;
    }
    require_keys_eq!(
        ledger.campaign,
        campaign.key(),
        CharityVaultError::DonorNotRegistered
    );
    require_keys_eq!(
        ledger.donor,
        ctx.accounts.donor.key(),
        CharityVaultError::DonorNotRegistered
    );
    ledger.amount = ledger
        .amount
        .checked_add(amount)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;
    campaign.raised = new_raised;

    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.donor.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;
    emit!(PledgeReceived {
        campaign: campaign.key(),
        donor: ledger.donor,
        amount,
        raised: campaign.raised
    });
    Ok(())
}

#[event]
pub struct PledgeReceived {
    pub campaign: Pubkey,
    pub donor: Pubkey,
    pub amount: u64,
    pub raised: u64,
}
