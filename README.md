# Bestcrow

**Crowdfunding on Solana where backers approve progress before more money is released.**

Built for **HackYeah 2026 — Superteam Poland: Finance Without Intermediaries**. Bestcrow helps early-stage creators and startup teams fund prototypes while giving backers control over further spending.

**Read first:** the [competition rules](docs/RULES%20Finance%20Without%20Intermediaries.pdf) and [challenge criteria](docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf). The PDFs in `docs/` are the highest-priority project requirements. All proposals below must comply with them.

## Proposed flow

1. A creator publishes a funding target, deadline, milestone budgets, voting rules, and any rewards.
2. Backers deposit into campaign escrow. If fundraising fails, contributions become refundable.
3. If fundraising succeeds, the creator receives an agreed starting budget; the rest stays in escrow.
4. The creator submits milestone evidence. Backer approval unlocks the next funding stage.
5. If the campaign stops under its agreed rules, backers can reclaim their share of the remaining refundable funds.

The proposed MVP uses contribution-weighted voting. The threshold, deadlines, and tranche sizes are still design decisions.

## What this protects

The proposed program would enforce custody, release permissions, voting outcomes, and refund claims. Backers would be able to stop further funding; money already paid to the creator cannot be recovered by escrow.

Votes express backer approval, not proof that a product works. Digital reward entitlements can be issued automatically. Physical merchandise requires suppliers, delivery, and a separately budgeted fulfilment process.

Milestone crowdfunding already exists. Our intended distinction is a clear workflow for prototype funding with transparent budgets and enforceable remaining-funds protection, rather than a claim to have invented the mechanism.

## For teammates

**Status: product design and development tooling.** A working Bestcrow crowdfunding application has not been verified. Existing escrow programs are external references.

- [Product model, rewards, risks, and open decisions](agents/PROJECT.md)
- [Hackathon requirements, repository map, and precedents](agents/CONTEXT.md)
- [Agent guidance](agents/AGENTS.md)
- [Environment and MCP setup](agents/INSTRUCTIONS.md)

**First build:** a devnet campaign with an initial release, one milestone vote, a successful payout, and a termination/refund path. Any merchandise integration in the demo should be clearly labelled as simulated.
