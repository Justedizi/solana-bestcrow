# Bestcrow — rough project idea

HackYeah 2026 · Superteam Poland · Finance Without Intermediaries

**Requirement priority:** the rules and criteria PDFs in `docs/` are authoritative. Every proposal in this file is subordinate to them. Read the PDFs first; if a proposal conflicts with a requirement, flag it and revise the proposal. Follow the root [AGENTS.md](../AGENTS.md) for handling ambiguous or conflicting clauses.

**Status:** product proposal, not an implemented application. The team has chosen an Allegro/OLX-style item marketplace with blockchain handling escrow. Physical goods are the working assumption. The pickup/shipping model and dispute policy remain to be decided.

## The idea in one sentence

**A peer-to-peer marketplace where buyers lock payment in a Solana escrow and agreed rules control its release, instead of a marketplace operator holding the money.**

Users browse listings, agree on an item and price, connect wallets, and transact through escrow. The marketplace helps people find each other; the on-chain program controls custody and settlement. Blockchain does not inspect goods, deliver parcels, or decide who is telling the truth.

## Is this a good idea?

**It is a credible hackathon direction if we demonstrate one useful transaction and explain the remaining trust honestly.** A complete competitor to Allegro or OLX is much larger than this hackathon.

The initial user hypothesis is private individuals buying and selling second-hand items to strangers. The specific category and demand still need validation. Start with an inexpensive item whose condition can be inspected at pickup.

Existing marketplaces already solve parts of this problem through payment protection, moderation, and dispute handling. Our proposed difference is verifiable escrow rules and payment custody that does not depend on the marketplace operator's wallet. Lower total costs, better fraud outcomes, and user adoption are hypotheses, not established advantages. Wallet setup, transaction fees, and funding a wallet add friction.

For local pickup, cash or an instant transfer is already a simple alternative. A pickup demo proves the escrow mechanics; it does not by itself prove people need the product. Validate whether buyers and sellers value payment reserved before meeting enough to accept the wallet friction. Shipping has a stronger advance-payment problem, but requires a much more demanding dispute and return model.

## The problem we solve

Without escrow, the buyer may pay and receive nothing; the seller may hand over an item and never receive payment. With platform-managed escrow, both parties also depend on the platform's custody and settlement decisions.

Bestcrow proposes to make the following enforceable in the program:

- The buyer has actually funded the agreed payment; a screenshot is not proof.
- Funds remain in an order-specific vault until a permitted release or refund.
- The buyer, seller, token, amount, deadlines, and settlement permissions are bound to the order.
- An ordinary marketplace administrator cannot redirect escrow money through a backend action.

That last claim depends on the deployed code and its upgrade authority. If the team can upgrade the program, that power remains a trust assumption and must be disclosed.

A database could track the same order statuses, but its operator could edit them and would still control the corresponding payment system. The proposed reason to use Solana is independently enforceable custody and settlement. This only helps users recover from a website outage if they can also access the program through another client.

## Proposed hackathon MVP

**Recommendation, pending the team's choice: local pickup with inspection.** This reduces dependence on a courier and disputed delivery evidence. Shipped orders are a possible later extension with a separate protection policy.

1. Seller creates a simple listing: item, description, condition, price, and pickup terms.
2. Buyer reviews the order terms and deposits a test asset into escrow on Solana devnet.
3. Seller accepts the funded order before an acceptance deadline. An unaccepted order can be refunded after that deadline; no handover is authorized before acceptance.
4. Buyer and seller meet. Buyer inspects the item, and the interface clearly explains what confirming payment does.
5. Buyer authorizes settlement; the program pays only the designated seller. Both see the confirmed transaction and order status.
6. Demonstrate a refund for an expired unaccepted order and rejection of an unauthorized withdrawal.

**The handover limitation:** the seller could refuse to hand over the item after payment, or the buyer could take it and refuse to confirm. In-person inspection reduces uncertainty but cannot make possession of a physical object and a blockchain payment atomic. Never advertise guaranteed protection against both outcomes.

For accepted orders, propose mutually agreed refunds and an explicit dispute state that blocks normal payout. If arbitration is included in the demo, both parties must accept the resolver before funding. Its authority should be limited to distributing that order's escrow between its buyer and seller, with no arbitrary destination or general access to other orders.

An accepted order with no agreement or available resolver can remain locked. The fallback for this case is an open protocol decision, not a solved feature. A real-money launch needs a published, implemented policy before accepting funds.

## Returns and worst cases

| Situation | Proposed response | Remaining risk / worst outcome |
| --- | --- | --- |
| Seller never accepts | Buyer claims refund after the acceptance deadline | A transaction must be submitted; a timer does not move money by itself |
| Seller accepts, then disappears | Buyer raises a dispute; no payout merely because the seller accepted | Without a usable resolver or agreed fallback, payment can remain locked |
| Wrong, damaged, counterfeit item, or empty parcel | Dispute before payout; hold escrow while evidence is evaluated | Photos and tracking do not prove the item's condition or contents; a bad decision can cost the buyer the payment |
| Buyer receives the item but falsely disputes | Evaluate both sides' evidence under the pre-agreed policy | A dishonest buyer may obtain both the item and a refund if the resolver is fooled |
| Buyer stops responding | Follow the order's explicit timeout/dispute policy | Automatic seller payout can reward a dishonest seller; automatic buyer refund can reward a dishonest buyer. Neither establishes what happened |
| Buyer wants a return while funds are held | Establish eligibility, deadline, return shipping costs, and how returned condition is checked; refund only under that policy | Seller may deny receiving the return; buyer may return a different or damaged item |
| Buyer wants a return after payout | Seller makes a new refund payment, or an explicitly funded reserve/insurance mechanism covers it | The original escrow cannot claw back money already released. This MVP does not promise a funded guarantee |
| Arbitrator disappears, lies, or colludes | Restrict authority to this order's buyer/seller allocation; define a replacement, appeal, or fallback policy before launch | Restricted custody does not guarantee a fair ruling. Either party can lose; no fallback may mean indefinite locking |
| Bug, stolen wallet key, or malicious program upgrade | Devnet-only prototype; review permissions, accounting, and upgrade powers before real funds | An exploit could drain funds across affected orders or lock them permanently; blockchain does not provide an automatic reversal |

For shipped orders, **“seller marked it shipped” is not a sufficient payout condition**. Courier tracking can contribute evidence of delivery, but cannot establish parcel contents, authenticity, or condition. A courier integration or oracle introduces a trusted source; it does not remove that dependency.

Return eligibility and consumer obligations depend on the seller's status, jurisdiction, and transaction. Before real use, define those obligations and how the system funds refunds. Smart-contract finality does not remove legal rights. No universal return period is assumed here.

The hardest failure is an honest party losing both the item and the money after a fraudulent claim, a bad ruling, or an exploit. Another is funds stuck indefinitely. An automatic 50/50 split or extra deposits might change incentives, but neither proves who is right or creates a free guarantee.

## What stays on-chain and off-chain

| On-chain enforcement | Marketplace and external work |
| --- | --- |
| Order parties, asset, amount, agreed terms commitment, deadlines, state, and escrow balance | Listings, images, search, messages, pickup/delivery coordination, and moderation |
| Signature checks, permitted payouts/refunds, dispute freeze, and any bounded resolver authority | Evidence collection and human decisions about real-world condition or delivery |

Keep names, addresses, conversations, and dispute evidence off the public chain. If an order commits to terms by hash, both parties must be able to retrieve the exact agreed terms; a hash proves a match to that text, not the truth of a delivery claim.

The interface proposes actions and explains consequences. A backend must not be able to bypass the settlement rules. Moderation and the ability to hide a listing must remain distinct from the authority to move escrow funds.

## Hackathon scope and proof

Build one listing-to-settlement flow, a refund path, visible order states, and clear transaction confirmation. Use two wallets and devnet test assets. If dispute resolution is shown, label the resolver and its powers openly. Demonstrate where a forbidden withdrawal is rejected by the program.

Defer courier integrations, a full marketplace search engine, reputation, appeals, fiat checkout, insurance, and broad buyer-protection promises. Rust/Anchor is the proposed program stack; choose one compatible frontend/SDK stack after checking the references. Existing examples are learning material, not a production-ready marketplace contract.

Our pitch should be: **“We replace platform custody and routine payment execution with verifiable escrow rules. Physical delivery and disputed item condition still need an explicit trust model.”**

## Decisions needed before implementation

1. Pickup, shipping, or both — and one exact demo item/user journey.
2. Payment asset and the moment buyer protection ends relative to payout.
3. Acceptance and inspection deadlines; who may cancel in each state.
4. Whether disputes are in the MVP; who resolves them, who pays, and what happens if the resolver fails.
5. Return policy and whether any money remains available after settlement to fund a refund.
6. Upgrade authority and the team's own contribution beyond reference escrow code.

After reading the authoritative PDFs, use this file as the product proposal. See [CONTEXT.md](CONTEXT.md) for a secondary hackathon summary and repository map, and [INSTRUCTIONS.md](INSTRUCTIONS.md) for tooling. All flows here remain proposals until implemented and checked against the PDF requirements.
