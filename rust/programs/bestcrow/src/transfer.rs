use crate::state::Campaign;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, TransferChecked};

pub fn transfer_in<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    token::transfer_checked(
        CpiContext::new(
            token_program.key(),
            TransferChecked {
                from,
                mint,
                to,
                authority,
            },
        ),
        amount,
        decimals,
    )
}

pub fn transfer_out<'info>(
    campaign: &Campaign,
    campaign_info: AccountInfo<'info>,
    vault: AccountInfo<'info>,
    recipient: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let id_bytes = campaign.campaign_id.to_le_bytes();
    let bump = [campaign.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[b"campaign", campaign.creator.as_ref(), &id_bytes, &bump]];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            TransferChecked {
                from: vault,
                mint,
                to: recipient,
                authority: campaign_info,
            },
            signer_seeds,
        ),
        amount,
        decimals,
    )
}
