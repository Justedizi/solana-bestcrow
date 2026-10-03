# Bestcrow — crowdfunding with accountable funding releases

> Historical v1 product proposal. On branch `v2`, the user chose MetaDAO Pass/Fail markets instead of the weighted backer voting described below. See the root `README.md` and current source for implemented behavior.

HackYeah 2026 · Superteam Poland · Finance Without Intermediaries

**Source priority:** the [rules](../docs/RULES%20Finance%20Without%20Intermediaries.pdf) and [challenge criteria](../docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf) in `docs/` govern project requirements. This file is a subordinate product proposal.

**Status:** the current product direction is crowdfunding for startup/prototype projects, with staged funding, weighted backer approval, a revision path, remaining-funds refunds, and optional rewards. The application is not verified as implemented. The rules below are the current product proposal; exact on-chain parameters still need a protocol decision and tests.

## Purpose

**Give creators enough money to make progress while letting backers control further releases and recover remaining refundable funds if the campaign stops.**

Creators need development capital before they can finish a product. Backers want evidence of progress before committing the entire campaign budget to the creator's control. A fundraising platform often controls custody and payouts; Bestcrow proposes an on-chain program that applies rules agreed before contributions.

The initial audience hypothesis is early-stage teams building a prototype and supporters who receive the stated product, access, or merchandise reward. This is reward-based funding or grants, not company equity or a promise of investment returns. Demand and willingness to use a wallet still need validation.

## Campaign lifecycle

1. **Define terms.** The creator publishes the funding target, deadline, payment asset, recipient, initial budget, at least five milestones, milestone evidence requirements, release amounts, voting rules, failure deadlines, reward commitments, and any creator bond. No milestone may allocate more than 50% of the agreed base budget. Each contribution must refer to those agreed terms. No unilateral edits after funding begins.
2. **Pre-goal pledge phase.** The campaign page can collect Kickstarter-style commitments or interest before the target is reached. These commitments are not yet on-chain funds and do not create a permissionless refund claim. The settlement phase starts only when a backer signs an actual contribution into the Solana escrow (or when a compatible payment authorization is implemented).
3. **Collect deposits.** Backers fund an escrow. This locks actual money during the campaign; it is not a promise to charge a card later.
4. **Finalize fundraising.** At the deadline, a failed target enables contribution refunds. Success unlocks only the agreed starting budget. Reaching the target early does not by itself authorize withdrawal in this proposed flow.
5. **Build and submit evidence.** The creator uses released funds and submits a demo, report, or other agreed evidence before the milestone deadline.
6. **Review and vote.** Eligible backers vote on whether the milestone was successfully delivered. Voting weight follows eligible contribution value fixed by the campaign rules. The first vote passes at 70% or more under the proposed policy.
7. **Release, improve, or show cause.** A passing vote makes the agreed next tranche claimable by the named recipient. A result from 50% up to but excluding 70% opens a seven-day improvement phase. A result below 50% opens a stricter show-cause/recovery phase, with the creator required to demonstrate why the campaign should continue. The creator then submits evidence for a second vote.
8. **Complete or terminate.** The second vote must meet the release threshold to unlock the next tranche. A second failed vote, a failed show-cause phase, or a missed improvement deadline moves the campaign to a disband/termination state; backers claim their share of the remaining refundable balance. Already released money is not recoverable by escrow.

Finalization and refunds require transactions. A worker may submit eligible transactions, but it cannot decide an outcome or redirect money.

## How the creator can afford the work

A campaign cannot keep every unit fully refundable while allowing that same money to be spent. A limited starting budget is an explicit risk backers accept.

Illustrative allocation for a 10,000-unit campaign:

| Trigger | Released | Remaining escrow |
| --- | ---: | ---: |
| Fundraising succeeds | 2,000 for the prototype | 8,000 |
| Prototype approved | 3,000 for development | 5,000 |
| Working product approved | 4,000 for production/fulfilment | 1,000 |
| Final obligations approved | 1,000 completion payment | 0 |

These amounts are examples. Derive actual budgets from costs; retaining too much could prevent completion. If the first review fails and the campaign terminates with 8,000 refundable units, a backer who supplied 1% of campaign funding can claim 80 units. The released 2,000 cannot be clawed back.

## Proposed voting model

The preferred MVP direction is **contribution-weighted approval** with weights fixed from eligible funded contributions after fundraising closes. A backer with more eligible contribution value has more vote weight. This is pseudonymous participation, not complete anonymity: wallet addresses and transactions are public.

The current policy direction is a **70% approval threshold for a milestone vote**, followed by a **seven-day improvement period and second vote** when the first result is below 70%. A first result below 50% enters a stricter show-cause/recovery phase. A second failed vote or failed show-cause phase triggers disband/termination and claims on remaining refundable funds.

- Define whether 70% means YES weight divided by all eligible weight or YES weight divided by votes cast. The safer proposal is all eligible weight, with abstentions not counted as approval.
- Define the exact evidence, deadline, and consequence for the below-50% show-cause phase, including whether a funded creator bond can be forfeited.
- Do not introduce a different threshold or review window without recording the decision in the protocol document.
- Splitting the same contribution across wallets must not increase its total weight. Define ties, boundaries, snapshots, ballot changes, transferability, and finalization before coding.
- Splitting the same contribution across wallets must not increase its total weight.
- Define ballot changes, ties/boundaries, snapshots, transferability, and finalization precisely before coding.
- Backers approve evidence; the blockchain does not establish whether a prototype is useful or merchandise is correct.
- Large backers, collusion, creator self-funding through other wallets, and dishonest rejection remain risks. A known creator-wallet exclusion alone cannot prevent disguised self-funding.
- Missed reviews and creator disappearance need published, bounded outcomes. Do not silently pay out on inactivity.

A creator cannot override rejection through a dashboard. Any exceptional administrator or upgrade powers must be visible in the trust model.

## Deadline consequences, overflow, and extra funding

Deadlines are useful only when the program can enforce the consequence. The current proposal is to stop the next release when a creator misses a milestone deadline, allow the seven-day improvement phase, and terminate/disband after the second failure. A creator bond may be added: a creator deposits a defined amount before funding, and the program can transfer part of that bond to backers after a predefined missed-deadline condition. A bond cannot recover money already spent and must not be described as a guarantee unless it is fully funded.

If a campaign raises 120% of its target, the additional 20% belongs in an explicitly identified overflow balance. The creator can submit an overflow request stating the amount and purpose; backers vote under a separate proposal. Approval makes the requested amount claimable, subject to the 50% milestone cap and accounting. Rejection leaves it governed by the campaign's published refund/overflow rule.

Extra funding is a new request, not an automatic charge. The creator may propose a new funding round with its own target, terms, and opt-in contributions. Existing backers cannot be charged through a poll without signing a new contribution transaction.

## Pseudonymous backers and optional profit sharing

Backers can participate through a wallet alias and avoid publishing a profile, but Solana exposes wallet addresses and transaction history. Use off-chain private storage for names, contact data, and reward fulfilment details; do not promise complete anonymity.

An optional future mode can route product revenue through an on-chain revenue vault and distribute an agreed percentage to backers until a cap. This is only enforceable for revenue that actually enters that vault; off-chain sales remain outside the program. It is not equity, a guaranteed return, or part of the first MVP, and may require legal review.

## Refunds and accounting

Refunds cover only the balance the campaign rules make available, not all money ever contributed.

At termination, freeze the refundable pool and contribution denominator, calculate each backer's share from that snapshot, and prevent duplicate claims. Define rounding and residual balances. Do not calculate successive claims from a shrinking pool or let transaction order change entitlements.

Track released development funds, any rewards reserve, authorized fees, paid supplier costs, and refund liabilities separately. Never count a reserved unit twice. Define how pre-existing supplier obligations affect cancellation before offering physical reward tiers.

For a minimal demo, use no real supplier commitments, no platform fee, and a single explicitly named test asset; these are recommended simplifications, not final business terms.

## Rewards and automation

Each reward tier identifies its entitlement, trigger, quantity, budget, and cancellation treatment before contributions.

| Event | Possible automation | What it does not prove |
| --- | --- | --- |
| Contribution confirmed | Record backer and reward entitlement | That a physical reward exists |
| Relevant milestone approved | Activate a unique reward claim | Product quality or delivery |
| On-chain reward claimed | Transfer/issue the defined asset | The value of an externally provided service |
| Merchandise details supplied privately | Submit a supplier order; retry idempotently | That the supplier will deliver correctly |
| Supplier/tracking update | Update fulfilment status and notify the backer | Parcel contents or recipient satisfaction |

Keep addresses, names, sizes, tracking details, and private evidence off-chain. A terms/evidence hash proves correspondence to a document, not the truth of its claims. Ensure backers can retrieve the committed evidence.

Useful additions are a budget/reward dashboard, reminders, accessible wallet onboarding, permissionless transaction execution, and a separate fulfilment reserve. For the hackathon, demonstrate merchandise using clearly labelled simulated orders; do not promise guaranteed physical delivery.

## Why blockchain, and how this differs from Kickstarter

Kickstarter's standard all-or-nothing model already protects against missing the initial funding goal: an unsuccessful campaign does not charge backers. Successful campaigns generally proceed to creator payout, rather than holding funds for a sequence of binding backer votes.

Bestcrow's proposed protection applies **after successful fundraising**: future releases stay subject to the agreed approval rules. A normal database can display those rules, but its operator controls the database and associated payout system. Our program should constrain the actual escrow and expose verifiable state.

This does not remove every trust assumption. The creator must still deliver; backers must assess evidence; suppliers must fulfil rewards; any program upgrade authority can affect guarantees. An alternate client is needed for practical recovery if the website disappears.

## Existing work and differentiation

The mechanism is established. Do not pitch “the first crowdfunding platform with voting.”

- [MilestoneFund](https://github.com/Henry2513/MilestoneFund): an Ethereum course project with weighted approval, staged releases, termination, and proportional refunds.
- [Web3 Milestone Crowdfunding](https://github.com/sabighiq/web3-milestone-crowdfunding): educational, unaudited code for contributor approval and refunds.
- [Pledgecamp contract documentation](https://github.com/pledgecamp/pledgecamp-docs/blob/main/docs/contracts/usage.md): initial payout plus reserved funds; weighted refund votes can block milestone releases. Unlike our proposed affirmative approval, its documented default favours release unless enough backers object. Current service operation was not verified.
- [Trustless Work](https://github.com/Trustless-Work/trustlesswork-smart-contract-stellar): Stellar milestone escrow using client approval, rather than the same crowdfunding electorate.
- [Stockpile v2](https://github.com/StockpileLabs/stockpile-v2): archived Solana crowdfunding reference; its README says milestone approval was not implemented.

Our differentiation must be a useful workflow for a specific audience: understandable stage budgets, voting and refunds, clear risk disclosure, and tracked rewards. Lower costs, greater adoption, and better outcomes remain hypotheses.

## Hackathon MVP and evidence

Build one campaign model on devnet with a funding deadline, at least five milestones, no milestone above 50% of the base budget, an initial release, a first failed vote, a seven-day revision, a second vote, next-tranche approval, and termination/refund paths. Demonstrate success and failure on separate campaign instances. Overflow and extra funding can remain a clearly labelled follow-up proposal unless the core flow is complete.

Show a connected wallet, visible campaign state, and confirmed explorer transactions. Verify the program rejects early/unauthorized releases, duplicate votes, duplicate refunds, and changes to funded terms. Display refundable and already-released amounts separately.

PDF mapping: challenge criteria p.1 explicitly includes fundraisers with conditional refunds; p.3 requires the intermediary-replacing logic on-chain. Our evidence is a refused unauthorized withdrawal and a backer claiming an eligible refund without platform approval. Criteria pp.2–3 require a complete live journey; evidence is a working UI through final settlement/refund, not a mockup.

Defer real-money deployment, equity, trading backer positions, real merchandise purchasing, autonomous judgments of product quality, casino/lottery features, and the prior secondhand marketplace flow.

## Additional local design notes to resolve

The root `ideas` note proposes at least five milestones, a maximum of 50% for each milestone, and a revision/evidence stage followed by dissolution when voting falls below 50%.

These are recorded proposals, not a complete voting specification. Specify whether the percentage uses all eligible backing or votes cast, what happens exactly at 50%, what counts toward the milestone cap (including the starting budget), how the below-50% show-cause phase works, and how much time the revision stage allows. “Disband” should mean a defined terminal state and claims on remaining refundable funds, not recovery of amounts already spent.

## Decisions to record next

- Exact target audience and campaign/reward example.
- Asset, target/cap, overfunding and contribution-cancellation rules.
- Initial budget, at least five-milestone schedule, maximum 50% allocation rule, 70% approval threshold, denominator, vote durations, and revision/disband policy.
- Creator bond amount and executable missed-deadline consequences.
- Overflow balance policy, overflow poll, and separate extra-funding round.
- Pseudonymous identity and privacy boundaries; optional revenue-vault percentage and cap.
- Eligibility, weight snapshots, ballot handling, and large-holder/self-funding risks.
- Termination deadlines, refundable-pool calculation, fees, rounding, and claims.
- Reward-reserve accounting and treatment of obligations when a campaign terminates.
- Upgrade/administrator powers, program location, and compatible frontend/client stack.

See [CONTEXT.md](CONTEXT.md) for hackathon requirements and repository facts, and [INSTRUCTIONS.md](INSTRUCTIONS.md) for development setup.
