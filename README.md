# Bestcrow

**A peer-to-peer item marketplace with payments held in Solana escrow.**

Built for **HackYeah 2026 — Superteam Poland: Finance Without Intermediaries**. The idea is an Allegro/OLX-style experience where the on-chain program holds the buyer's payment and enforces the agreed release/refund rules.

**Read first:** the [competition rules](docs/RULES%20Finance%20Without%20Intermediaries.pdf) and [challenge criteria](docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf). The PDFs in `docs/` are the highest-priority project requirements; this README and all product proposals must comply with them. See [AGENTS.md](AGENTS.md) for the source-priority policy.

## How it would work

1. Seller lists an item; buyer and seller agree on the price and terms.
2. Buyer funds an escrow; seller can verify the money is there.
3. The item is inspected or delivered under the agreed process.
4. The program releases payment to the seller or refunds the buyer only when the order's rules allow it.

**Proposed first demo:** one item, two wallets, local pickup with inspection, payment confirmation, and a refund for an order the seller never accepts. Use Solana devnet and test assets.

## What this solves — and its limits

The goal is to reduce the need to trust a marketplace operator with custody and routine settlement. Blockchain can enforce who may move the money; it cannot prove that a physical item arrived or matches its description. Returns and disputed transactions need an explicit policy and may require a trusted resolver. After payout, the original escrow cannot force the seller to refund.

## For teammates

**Status: planning and tooling.** A working Bestcrow marketplace has not been verified. Existing escrow examples are external references.

- [Project idea, worst cases, and open decisions](agents/PROJECT.md)
- [Hackathon requirements and repository context](agents/CONTEXT.md)
- [Agent and MCP setup](agents/INSTRUCTIONS.md)
- [Copy-paste environment setup prompt](prompt)

**First decision:** choose pickup or shipping for the demo, then agree on the payout, refund, and dispute rules before coding them.
