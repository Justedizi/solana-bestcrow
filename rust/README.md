# Bestcrow v2 Anchor program

`bestcrow` is the Rust custody and milestone state machine. The TypeScript backend and any frontend consume the generated IDL in `idl/` and the Codama client in `clients/js/`. The on-chain program never accepts a platform administrator for release or refunds.

## Accounts

- `Campaign` PDA: `["campaign", creator, campaign_id_le]`. Holds immutable terms, balances, statuses and up to ten ordered milestones.
- `Vault` SPL Token account PDA: `["vault", campaign]`, owned by the campaign PDA, holds Circle USDC only.
- `Backer` PDA: `["backer", campaign, wallet]`, records the contribution for pro-rata refunds.
- `DaoBinding` PDA: `["dao-binding", meta_dao]`, prevents one DAO's proposal markets from controlling unrelated campaigns.

Campaigns require five to ten ordered milestones. The kickoff tranche is at most 30% of the goal, each milestone is at most 50%, and all payouts must sum exactly to the goal. These limits are validated on chain.

The quote mint must be the Circle USDC mint on devnet or mainnet and have six decimals. The creator supplies a distinct project `base_mint`. The MetaDAO DAO must use exactly that base/quote pair and have a funded spot pool sufficient to seed its required conditional liquidity. A precreated, distinct Draft MetaDAO proposal is fixed for each milestone at campaign creation. All proposal accounts are passed in the same order as the milestones.

## Instructions

- `create_campaign`: fixes goal, metadata hash, funding deadline, market timeout, kickoff amount, milestones, DAO and mints. Its `remaining_accounts` are the ordered MetaDAO proposal accounts.
- `pledge`, `withdraw_pledge`, `close_backer`: SPL deposits and exits during funding. Reaching the exact goal transfers the kickoff amount and activates the campaign.
- `finalize_funding`, `cancel_campaign`: freeze remaining escrow for refunds when funding fails or the creator cancels before activation.
- `submit_evidence`: creator records a nonzero evidence hash before the current due date while the precommitted proposal is still Draft.
- `resolve_milestone`: anyone can submit the finalized MetaDAO proposal. `Passed` transfers the tranche to the creator; `Failed` freezes the remaining escrow.
- `expire_milestone`: anyone can terminate after a missed evidence or market deadline. A finalized MetaDAO outcome cannot be overwritten by a timeout.
- `claim_refund`: anyone may execute a backer's refund to that wallet's USDC account. The backer receipt closes and its rent returns to the backer.
- `sweep_dust`: after every positive backer receipt has claimed, anyone can send rounding dust to the creator.

Refunds use a frozen pool and denominator: `floor(backer_contribution * refund_pool / total_raised)`. Claim order cannot change an entitlement. Released tranches cannot be clawed back. Wallet addresses, amounts and hashes are public on Solana; no personal identity data is stored.

## MetaDAO boundary

The program reads the verified owner and discriminator of MetaDAO v0.6.1 DAO and Proposal accounts. It relies on MetaDAO's own finalization for TWAP calculation, threshold choice and conditional vault settlement. StageGate does not reimplement those formulas. The MetaDAO program ID and account layout are pinned in `programs/bestcrow/src/meta_dao.rs`. The backend uses MetaDAO's official TypeScript SDK to prepare its unsigned proposal instructions.

Only a timely finalized, non-sponsored proposal can release a tranche. Team-sponsored proposals terminate the campaign for refunds, and a proposal launched after the StageGate market deadline can time out even if it later finalizes. The evidence hash is an immutable reference to off-chain material, not an oracle of product quality. The proposal's Squads action must be reviewed by participants before they fund the campaign. MetaDAO proposal setup, funding its spot liquidity, and proposal staking happen outside StageGate escrow.

## Upgrade authority

The Solana upgradeable loader controls program upgrades. While an upgrade authority exists, it can replace this logic. `../scripts/check-upgrade-authority.sh` reads the deployed authority without signing. A production deployment should disclose its authority and review policy before accepting funds.
