# Bestcrow v2 project instructions

## Source priority

Read the actual competition rules in `docs/RULES Finance Without Intermediaries.pdf` and the challenge criteria in `docs/CRITERIA Finance Without Intermediaries PLENG.pdf` before making competition claims. They take precedence over Markdown plans and reference code. Cite PDF filename and page/section when a requirement drives a change, and verify it before claiming completion.

## Current implementation direction

The user chose to replace the earlier contribution-weighted backer-voting proposal with MetaDAO Pass/Fail markets. On branch `v2`, `rust/programs/bestcrow` is the USDC milestone escrow program, `backend/` prepares MetaDAO instructions and runs a keeper, and `frontend/` is a barebone Pass/Fail trading screen. The original SOL Charity Vault is in the `main` branch. `agents/PROJECT.md`, `agents/CONTEXT.md`, `EXECUTION_PLAN.md` and `INSPIRATIONS.md` contain historical plans; do not report their voting model as implemented on `v2`.

- Require five to ten milestones, with no single milestone over 50% of the goal and kickoff release at most 30%. All allocations must sum to the goal.
- Keep deposits, payout permission, deadlines and refund accounting on chain. The backend prepares transactions but cannot override the program.
- MetaDAO owns market pricing and finalizes its proposal. Bestcrow verifies the bound account and outcome; it does not judge an off-chain deliverable.
- Refunds cover remaining escrow only; already released funds cannot be recovered.
- Participation is pseudonymous: wallets, amounts and transactions are public. Do not put personal or shipping details on chain.
- An active program upgrade authority can change rules. Disclose it for any deployment.
- Keep implemented, tested and live-verified behavior distinct. A Docker build or unit test is not a confirmed on-chain trade.

For versioned external APIs, follow the Context7 workflow in `INSTRUCTIONS.md` if those MCP tools are available. If unavailable, use official versioned documentation and state that the live lookup was unavailable. Never use reference code in `context/` as proof of this program's behavior.
