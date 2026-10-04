# Charity Vault program: current-code reference

This file describes the **existing, legacy Anchor program** at commit
`15cb14a`. It is not the approved Bestcrow MVP protocol. The source is
`rust/programs/charity-vault/src/`; the detailed present instruction
contract is in [rust/docs/API.md](../rust/docs/API.md). New startup
requirements and the chronological migration are in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Current account model

The program ID declared in source is
`74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG`.
That declaration is not proof that the latest build is deployed.
The program uses one shared executable, not a new program per campaign:

| Account | PDA seeds | Current purpose |
| --- | --- | --- |
| Campaign | `campaign, creator, campaign_id` | Goal, deadline, raised amount, status, donor registry and staged fields |
| Vault | `vault, campaign` | Campaign SOL, owned by the program |
| Donor ledger | `donor, campaign, donor` | Pledge amount and refund claim state |
| Milestone | `milestone, campaign, index` | Fixed amount, evidence hash, status and votes |
| Vote | `vote, milestone, round, backer` | One record per backer and round |
| Bond vault | `bond, campaign` | Optional current creator bond |
| Split | `split, campaign` | Up to five recipients |
| Claim | `claim, campaign, index` | Released, potentially vesting tranche |

The current `MAX_DONORS = 12` cap is tied to `refund_all`; it must be
removed for a scalable individual-refund model. Current milestone approval
uses at least 70% of `raised`, with no vote window. The target is strictly
more than 50% of final contribution weight after a seven-day vote, then
30 days of improvement and a second seven-day vote.

## Current instruction groups

- Base flow: `create_campaign`, `pledge`, `finalize`,
  `claim_success`, `claim_refund`, `refund_all`.
- Staged flow: `create_staged_campaign`, `add_milestone`,
  `submit_evidence`, `vote_milestone`, `finalize_vote`,
  `release_initial`, `set_split`, `release_tranche`,
  `withdraw_claim`, `terminate`, `claim_termination_refund`,
  `claim_bond`.

These entrypoints do not yet provide a sealed 2-5 tranche schedule, a
1% success fee, mandatory 0.1 SOL deposit, overfunding, cancellation during
funding, timed votes, a safe missed-evidence path, or unlimited donor
registrations. In the target product, all tranches including the starting
release must sum to 100% of the **post-fee** contribution balance, with
each at most 50%.

## Known security and accounting gaps

1. A fully withdrawn claim is closed while its milestone remains released,
   allowing the claim PDA to be recreated and paid again until the broader
   `released <= raised` check stops it.
2. A caller can choose a different program-owned account instead of the
   configured split PDA and send the full claim to the creator.
3. The creator can reclaim the bond immediately after funding succeeds,
   defeating later forfeiture; a failed funding goal strands the bond.
4. Anyone can finalize a submitted vote immediately, even before other
   backers vote or with zero votes.
5. Milestones may be added after backers pledge. Their deadlines and order
   are not fully enforced by the release flow.
6. Termination freezes the entire vault as a refund pool, including funds
   backing approved but unpaid claims, then prevents their withdrawal.

See [the implementation plan](IMPLEMENTATION_PLAN.md) for the exact fixes and
adversarial tests. No current code path should be described as an audited or
deployed target MVP merely because it appears in this reference.
