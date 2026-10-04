# Bestcrow agent instructions

## Source priority

Read the actual [competition rules](../docs/RULES%20Finance%20Without%20Intermediaries.pdf)
and [challenge criteria](../docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf)
for competition claims. Cite the PDF file and page/section when a clause
affects a decision. User instructions override older product proposals;
do not revive stale 70% approval, a seven-day revision, minimum five
milestones or no-fee assumptions. If sources disagree, quote both and
surface the ambiguity.

The canonical current target and ordered work list is
[docs/IMPLEMENTATION_PLAN.md](../docs/IMPLEMENTATION_PLAN.md).
[PROJECT.md](PROJECT.md) describes the product rationale;
[INSTRUCTIONS.md](INSTRUCTIONS.md) contains local setup. Always separate
**current implementation**, **target behavior** and **verified behavior**.
At commit `15cb14a`, the frontend campaign pages are scaffolds and the
current program still contains legacy base and staged flows.

## Target protocol guardrails

- Startup/prototype campaigns use SOL, 7-183 days of fundraising and
  2-5 positive tranche shares that sum to 100%, none above 50%. The
  initial release counts as one tranche. Lock all terms before accepting
  a pledge; do not change them afterward.
- Allow funding above the goal and cancellation during the fundraising
  window only. A missed goal gives each backer 100% of their contribution
  back without a platform fee. After a met goal, charge exactly 1% of
  the actual raised amount once, then distribute the net by shares.
- Require a separate 0.1 SOL creator deposit. Its time and conditions
  for return/forfeiture are not yet finalized; do not invent a policy
  or allow it to be reclaimed before the published conditions hold.
- Voting weight is the final pledged amount. Approval requires strictly
  more than half of **all** eligible contribution weight. A seven-day
  first vote is followed on failure by 30 full days for improvement and
  then a seven-day second vote. Exactly half, abstention and no votes
  are not approval. Missed evidence needs an on-chain consequence.
- Payment and refund accounting must keep outstanding approved claims,
  available refund pool, deposited bond, platform fee and rent distinct.
  No repeated milestone payout or caller-selected split bypass. Make
  deadline transitions and eligible settlement permissionless, without
  permitting a caller to redirect funds.
- Remove the 12-donor design cap and batch `refund_all` in the target
  version. Use individual pull refunds or caller-paid `refund_for`;
  a timer alone never sends a transaction.
- Do not add creator identity verification, admin campaign approval
  or a required platform signature to the program. Wallet-first
  accounts and creator organization profiles may exist off-chain.
  Bot resistance is deferred by the user.
- Backer votes judge evidence, not truth or delivery. Keep sensitive
  reward data private; disclose the service dependency for rewards.
  Disclose the actual upgrade authority and the fixed fee recipient.

Test numerical boundaries, malicious account substitution, repeated
claims, missing participants, overfunding, more than 12 donors and
refund/fee invariants on a local validator or LiteSVM. Document the
actual deployment and confirmed transactions before calling the target
flow working. The criteria PDF (p. 3, section 5) requires the
intermediary-replacing logic on-chain.

For library/API work follow the version-matched Context7 and Solana docs
workflow in [INSTRUCTIONS.md](INSTRUCTIONS.md). External reference
material is not evidence of this program's behavior. Keep changes
scoped to the requested modules and reports concise.
