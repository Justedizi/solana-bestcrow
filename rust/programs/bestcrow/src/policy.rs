use crate::{
    constants::*,
    error::BestcrowError,
    state::{CampaignStatus, CreateCampaignArgs},
};
use anchor_lang::prelude::*;

pub fn validate_terms(args: &CreateCampaignArgs, now: i64) -> Result<()> {
    require!(args.goal > 0, BestcrowError::InvalidTerms);
    require!(args.metadata_hash != [0; 32], BestcrowError::InvalidTerms);
    require!(args.funding_deadline > now, BestcrowError::InvalidTerms);
    require!(
        (MIN_MARKET_TIMEOUT_SECS..=MAX_MARKET_TIMEOUT_SECS).contains(&args.market_timeout_secs),
        BestcrowError::InvalidTerms
    );
    require!(
        (MIN_MILESTONES..=MAX_MILESTONES).contains(&args.milestones.len()),
        BestcrowError::InvalidTerms
    );
    require!(
        (args.initial_release as u128) * BPS_DENOMINATOR
            <= (args.goal as u128) * MAX_INITIAL_RELEASE_BPS,
        BestcrowError::InvalidTerms
    );
    let mut sum = args.initial_release;
    let mut previous_due = args.funding_deadline;
    for (index, spec) in args.milestones.iter().enumerate() {
        require!(spec.amount > 0, BestcrowError::InvalidTerms);
        require!(
            (spec.amount as u128) * BPS_DENOMINATOR
                <= (args.goal as u128) * MAX_MILESTONE_RELEASE_BPS,
            BestcrowError::InvalidTerms
        );
        require!(
            spec.proposal != Pubkey::default(),
            BestcrowError::InvalidTerms
        );
        require!(
            spec.due_at > previous_due.saturating_add(args.market_timeout_secs),
            BestcrowError::InvalidTerms
        );
        require!(
            !args.milestones[..index]
                .iter()
                .any(|earlier| earlier.proposal == spec.proposal),
            BestcrowError::InvalidTerms
        );
        sum = sum
            .checked_add(spec.amount)
            .ok_or(BestcrowError::Arithmetic)?;
        previous_due = spec.due_at;
    }
    require!(sum == args.goal, BestcrowError::InvalidTerms);
    Ok(())
}

pub fn funding_succeeds(raised: u64, goal: u64, now: i64, first_due_at: i64) -> bool {
    raised == goal && now <= first_due_at
}

pub fn can_close_backer(status: CampaignStatus, amount: u64, claimed: bool) -> bool {
    (status == CampaignStatus::Funding && amount == 0)
        || status == CampaignStatus::Completed
        || ((status == CampaignStatus::Failed || status == CampaignStatus::Terminated) && claimed)
}

pub fn refund_amount(contribution: u64, pool: u64, denominator: u64) -> Result<u64> {
    require!(denominator > 0, BestcrowError::RefundUnavailable);
    let amount = (contribution as u128)
        .checked_mul(pool as u128)
        .ok_or(BestcrowError::Arithmetic)?
        / denominator as u128;
    u64::try_from(amount).map_err(|_| error!(BestcrowError::Arithmetic))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::MilestoneInput;

    fn terms() -> CreateCampaignArgs {
        CreateCampaignArgs {
            campaign_id: 1,
            goal: 1_000_000,
            initial_release: 300_000,
            funding_deadline: 10,
            market_timeout_secs: MIN_MARKET_TIMEOUT_SECS,
            metadata_hash: [1; 32],
            milestones: (0..5)
                .map(|index| MilestoneInput {
                    amount: 140_000,
                    due_at: 10 + (index + 1) * (MIN_MARKET_TIMEOUT_SECS + 1),
                    proposal: Pubkey::new_unique(),
                })
                .collect(),
        }
    }

    #[test]
    fn terms_require_five_bounded_market_tranches() {
        assert!(validate_terms(&terms(), 0).is_ok());
        let mut invalid = terms();
        invalid.milestones[0].due_at = 10 + MIN_MARKET_TIMEOUT_SECS;
        assert!(validate_terms(&invalid, 0).is_err());
        invalid = terms();
        invalid.initial_release = 300_001;
        assert!(validate_terms(&invalid, 0).is_err());

        invalid = terms();
        invalid.milestones.pop();
        invalid.milestones[0].amount += 140_000;
        assert!(validate_terms(&invalid, 0).is_err());

        invalid = terms();
        invalid.milestones[0].amount = 500_001;
        invalid.milestones[1].amount = 1;
        invalid.milestones[2].amount = 1;
        invalid.milestones[3].amount = 1;
        invalid.milestones[4].amount = 199_996;
        assert!(validate_terms(&invalid, 0).is_err());
    }

    #[test]
    fn duplicate_proposals_cannot_control_two_tranches() {
        let mut invalid = terms();
        invalid.milestones[1].proposal = invalid.milestones[0].proposal;
        assert!(validate_terms(&invalid, 0).is_err());
    }

    #[test]
    fn refund_math_is_order_independent() {
        assert_eq!(refund_amount(25, 80, 100).unwrap(), 20);
        assert_eq!(refund_amount(1, 1, 3).unwrap(), 0);
        assert_eq!(
            refund_amount(u64::MAX, u64::MAX, u64::MAX).unwrap(),
            u64::MAX
        );
    }

    #[test]
    fn only_finished_receipts_can_close() {
        assert!(!can_close_backer(CampaignStatus::Active, 100, false));
        assert!(can_close_backer(CampaignStatus::Funding, 0, false));
        assert!(can_close_backer(CampaignStatus::Terminated, 100, true));
    }
}
