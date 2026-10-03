# Bestcrow agent instructions

## Highest project priority: the PDFs

Read the actual [competition rules](../docs/RULES%20Finance%20Without%20Intermediaries.pdf) and [challenge criteria](../docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf) first. Check for added or updated PDFs in `docs/`. They take precedence over project proposals, Markdown summaries, reference code, skills, MCP guidance, and agent assumptions about the challenge.

When a requirement affects a decision, cite its PDF filename and page/section and connect the planned change to its verification. Correct conflicting summaries. If source clauses disagree, quote both and surface the ambiguity; do not invent a deadline, exception, or precedence between PDFs. Report missing/unreadable sources and continue independent work without claiming compliance. Check applicable requirements again before declaring a milestone or submission ready.

## Current project direction

**Bestcrow is startup/prototype crowdfunding on Solana with staged funding, backer approval, refunds of remaining escrow, and optional rewards.** The prior item-marketplace, casino, and lottery ideas are not the current MVP.

Read [PROJECT.md](PROJECT.md) for the product model, [CONTEXT.md](CONTEXT.md) for hackathon and repository context, and [INSTRUCTIONS.md](INSTRUCTIONS.md) for tools and implementation checks.

Use **creator/founder** for the recipient and **backer** for the contributor. Keep proposed, implemented, and verified behavior distinct.

## Rules for implementation and claims

- Keep deposits, campaign terms, voting weights/outcomes, release permissions, and refund accounting enforced on-chain. A backend must not bypass them.
- Treat the discussed 60% approval threshold, 72-hour review, one revision, and sample tranche budgets as proposals until chosen and recorded.
- State refund limits: previously released funds are not recoverable by escrow. Never promise the same funds for development, merchandise, and refunds.
- Backer votes measure approval, not objective product quality. Address inactivity, collusion, large contributors, creator self-funding, and missed deadlines.
- Reward entitlement, supplier order, and completed delivery are different states. Keep names, addresses, and fulfilment details off the public chain.
- A timer does not execute a transaction by itself. Define who may finalize outcomes and submit claims; optional workers must have no extra financial authority.
- Disclose any upgrade authority or administrator power that can change the promised rules.
- Do not claim the model is globally new: Pledgecamp and other milestone crowdfunding projects are close precedents.

For library/API work, follow the Context7 workflow in [INSTRUCTIONS.md](INSTRUCTIONS.md), matching actual dependency versions. Use the Solana docs MCP for additional Solana and Anchor guidance.

Code in `context/` is external reference material, not the crowdfunding implementation. Preserve attribution, inspect licenses, and never reuse upstream deployment links as evidence of our work.

Keep reports clear and brief: lead with the result, label assumptions, and identify the next concrete action.
