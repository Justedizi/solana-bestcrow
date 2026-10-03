# Bestcrow

**Crowdfunding on Solana where backers approve progress before more money is released.**

Built for **HackYeah 2026 — Superteam Poland: Finance Without Intermediaries**. Bestcrow helps early-stage creators and startup teams fund prototypes while giving backers control over further spending.

**Read first:** the [competition rules](docs/RULES%20Finance%20Without%20Intermediaries.pdf) and [challenge criteria](docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf). The PDFs in `docs/` are the highest-priority project requirements. All proposals below must comply with them.

## Proposed flow

1. A creator publishes a funding target, deadline, at least five milestone budgets, voting rules, deadline consequences, and any rewards; no milestone may exceed 50% of the base budget.
2. Backers deposit into campaign escrow. If fundraising fails, contributions become refundable.
3. If fundraising succeeds, the creator receives an agreed starting budget; the rest stays in escrow.
4. Backers vote with contribution-weighted power: 70% approval releases the next stage; 50%–69.99% gives the creator seven days to improve, while below 50% opens a stricter show-cause phase.
5. A second failed vote or failed show-cause phase disbands/terminates the campaign, enabling claims on remaining refundable funds; overflow and extra-funding requests require separate polls.

The current proposal uses contribution-weighted voting, at least five milestones, a 50% maximum allocation per milestone, a 70% approval threshold, a seven-day revision phase for borderline failures, and a show-cause phase for results below 50%. Exact denominator, boundaries, penalties, and execution triggers still need protocol decisions.

## What this protects

The proposed program would enforce custody, immutable funded terms, release permissions, voting outcomes, deadline consequences, overflow approvals, and refund claims. Backers would be able to stop further funding; money already paid to the creator cannot be recovered by escrow.

Votes express backer approval, not proof that a product works. Digital reward entitlements can be issued automatically. Physical merchandise requires suppliers, delivery, and a separately budgeted fulfilment process.

Milestone crowdfunding already exists. Our intended distinction is a clear workflow for prototype funding with transparent budgets, a revision phase, enforceable deadline consequences, permissionless exit, pseudonymous participation, and remaining-funds protection, rather than a claim to have invented the mechanism.

## For teammates

**Status: product design and development tooling.** A working Bestcrow crowdfunding application has not been verified. Existing escrow programs are external references.

- [Product model, rewards, risks, and open decisions](agents/PROJECT.md)
- [Hackathon requirements, repository map, and precedents](agents/CONTEXT.md)
- [Agent guidance](agents/AGENTS.md)
- [Environment and MCP setup](agents/INSTRUCTIONS.md)

**First build:** a devnet campaign with five milestones, an initial release, a failed first vote, a seven-day revision state, a successful second vote, and a termination/refund path. Any merchandise integration or profit sharing should be clearly labelled as simulated/future scope.
