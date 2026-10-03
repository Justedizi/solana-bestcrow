use super::claim_refund::RefundIssued;
use crate::{constants::*, error::CharityVaultError, state::*};
use anchor_lang::{prelude::*, system_program};

#[derive(Accounts)]
pub struct RefundAll<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut)]
    pub campaign: Account<'info, CampaignAccount>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: This PDA is derived from the campaign and only stores campaign lamports.
    pub vault: UncheckedAccount<'info>,
    /// CHECK: Bound to the campaign creator; receives the residual vault rent.
    #[account(mut, address = campaign.creator)]
    pub creator: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RefundAll>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Refunded,
        CharityVaultError::CampaignNotRefunded
    );
    let count = campaign.donor_count as usize;
    require!(
        ctx.remaining_accounts.len() == count * 2,
        CharityVaultError::InvalidRefundAccounts
    );

    let vault = ctx.accounts.vault.to_account_info();
    let vault_seeds: &[&[u8]] = &[VAULT_SEED, campaign.key().as_ref(), &[ctx.bumps.vault]];

    for index in 0..count {
        let ledger_info = &ctx.remaining_accounts[index * 2];
        let recipient_info = &ctx.remaining_accounts[index * 2 + 1];
        let donor = campaign.donors[index];

        require_keys_eq!(
            *recipient_info.key,
            donor,
            CharityVaultError::InvalidRefundAccounts
        );
        require!(
            recipient_info.is_writable,
            CharityVaultError::InvalidRefundAccounts
        );

        let expected = Pubkey::find_program_address(
            &[DONOR_SEED, campaign.key().as_ref(), donor.as_ref()],
            &crate::ID,
        )
        .0;
        require_keys_eq!(
            *ledger_info.key,
            expected,
            CharityVaultError::InvalidRefundAccounts
        );

        // A ledger closed by an earlier `claim_refund` is no longer owned by
        // this program. Skip it: that donor was already paid and had their rent
        // returned.
        if ledger_info.owner != &crate::ID {
            continue;
        }

        let amount = {
            let ledger: Account<DonorLedgerAccount> = Account::try_from(ledger_info)?;
            require_keys_eq!(
                ledger.campaign,
                campaign.key(),
                CharityVaultError::InvalidRefundAccounts
            );
            require_keys_eq!(
                ledger.donor,
                donor,
                CharityVaultError::InvalidRefundAccounts
            );
            if ledger.claimed {
                0
            } else {
                ledger.amount
            }
        };

        if amount > 0 {
            require!(
                vault.lamports() >= amount,
                CharityVaultError::InsufficientVaultBalance
            );
            system_program::transfer(
                CpiContext::new_with_signer(
                    system_program::ID,
                    system_program::Transfer {
                        from: vault.clone(),
                        to: recipient_info.clone(),
                    },
                    &[vault_seeds],
                ),
                amount,
            )?;
        }

        // Return the ledger's rent to the donor and close the account so no
        // lamports are stranded.
        let rent = ledger_info.lamports();
        if rent > 0 {
            **ledger_info.try_borrow_mut_lamports()? = 0;
            let recipient_balance = recipient_info.lamports();
            **recipient_info.try_borrow_mut_lamports()? = recipient_balance
                .checked_add(rent)
                .ok_or(CharityVaultError::ArithmeticOverflow)?;
        }
        ledger_info.try_borrow_mut_data()?.fill(0);
        ledger_info.assign(&system_program::ID);

        if amount > 0 {
            emit!(RefundIssued {
                campaign: campaign.key(),
                donor,
                amount
            });
        }
    }

    // Sweep the vault's rent reserve back to the creator and empty the vault.
    let residual = vault.lamports();
    if residual > 0 {
        system_program::transfer(
            CpiContext::new_with_signer(
                system_program::ID,
                system_program::Transfer {
                    from: vault.clone(),
                    to: ctx.accounts.creator.to_account_info(),
                },
                &[vault_seeds],
            ),
            residual,
        )?;
    }
    Ok(())
}
