# Bestcrow product direction

This is a **target product specification**, not a claim that the current
checkout implements it. Read the [chronological implementation plan](../docs/IMPLEMENTATION_PLAN.md)
for account changes, test cases and current-versus-target status. The
[competition rules](../docs/RULES%20Finance%20Without%20Intermediaries.pdf)
and [criteria](../docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf)
take precedence on competition requirements.

## User and problem

Bestcrow serves early-stage startup/prototype teams and their backers. It is
reward/grant-based funding, not equity or a guaranteed investment return.
A backer should not have to trust a platform to hold SOL, select projects for
on-chain eligibility, change a release outcome or authorize a refund. The
creator still has to deliver, and backers still judge the evidence. Neither
the program nor a vote proves product quality or physical delivery.

Only the MVP's startup funding flow is in scope. The old charity-only copy,
simple all-or-nothing mode and experimental stock-market direction are
legacy/reference material, not a second target product.

## Protocol agreed with the user

1. The creator prepares a complete draft. Starting funding locks its goal,
   campaign deadline, public terms hash, payout recipients, schedule and fee
   before the first contribution. Funding runs for 7-183 days.
2. There are 2-5 tranches **including the initial release**. Each has a
   positive share of at most 50%; together they equal 100%. Milestone work
   periods are committed before funding and activate in order. A revision
   deterministically shifts later deadlines instead of allowing unilateral
   edits.
3. Backers deposit SOL on-chain and may cancel while fundraising is open.
   There is no funding cap at the goal. At the deadline anyone can submit the
   finalization transaction. A missed goal enables a 100% return of each
   outstanding contribution, without platform fee. Network transaction fees
   and rent are disclosed separately.
4. A met goal charges a fixed 1% of the **actual final raised amount** once
   to a disclosed treasury. The remaining 99% is allocated by the tranche
   percentages. Rounding must never pay more than the funded balance.
5. The creator places a separate 0.1 SOL deposit. It is not a backer pledge
   or vote weight. Its precise return/forfeiture events and waiting period
   remain an explicit decision before settlement code is changed.
6. After evidence, a vote is open for exactly seven days. YES must represent
   strictly more than 50% of the full final contribution weight. Exactly 50%
   and no votes fail. On first failure the creator has 30 full days to improve;
   the second seven-day vote starts after that interval. A second failure
   or missing proof leads to termination under the published rules.
7. An approved tranche is payable exactly once to fixed recipients. Backers
   can recover a pro-rata share of the remaining unreserved escrow after
   termination. Previously paid funds cannot be recovered on-chain.
   Anyone can trigger an eligible transition, but transactions still must
   be submitted. A worker may help with that and has no extra authority.

The program must reserve previously approved, unpaid claims before freezing
a termination refund pool. A creator may return previously paid SOL to the
vault before ending the campaign; that is voluntary, never an assumed
guarantee. The schedule, fee, deposit, recipient and refund math belong
on-chain. A database can index and display them but cannot overrule them.

## Accounts, content and rewards

Wallet connection is the natural backer entry point. The backend may create
a pseudonymous wallet-first account for a backer and store a creator's
organization profile, but **no creator identity verification, approval
queue or platform co-signature** is part of the MVP. Site listings may
display profiles; direct program use remains permissionless. Bot resistance
is a later product decision. Splitting contribution value among wallets
must not increase its total voting weight.

Core campaign terms and evidence need a stable, publicly retrievable
document tied to an on-chain hash/URI, so another client can present the
rules if our website disappears. Reward inventory, digital keys and
shipping details may be kept in private server storage for an MVP; this
means their fulfilment still depends on an off-chain service and creator.
Wallet addresses and transactions are public, so users are pseudonymous,
not anonymous. Never put names, addresses, phone numbers or secret keys
on the public chain.

## Trust and business boundary

The 1% fee is a deterministic, disclosed protocol charge only on success.
It must not grant the fee recipient discretionary custody or payout powers.
Disclose the treasury address, network fees, rent, creator deposit and any
upgrade authority. Do not promise that rules are unchangeable while an
upgrade authority can replace program logic. Remove that authority only
after the intended version is tested and deployed.

This mechanism is not globally novel. Pledgecamp and other milestone
crowdfunding projects are precedents. Bestcrow's claim should rest on its
specific, usable Solana workflow and transparent constraints, not a
"first ever" claim.

## Open decisions and verification

Before implementing deposit settlement, decide its return time after a
failed goal and a fully completed project, whether voluntary abandonment
or a second failed vote forfeits it, and how a missed proof deadline
behaves. Decide the exact treasury address and durable content store.
These decisions are tracked in the [plan](../docs/IMPLEMENTATION_PLAN.md).

The [criteria PDF](../docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf)
(p. 2, section 2; p. 3, sections 5-6) requires identical on-chain terms,
the intermediary-replacing logic in the program, a complete live journey
and honest disclosure of author powers. The checkout must be tested against
those requirements before a hackathon-readiness claim.
