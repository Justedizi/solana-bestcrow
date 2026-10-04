# Bestcrow frontend: startup crowdfunding sketch

This file retains the old sketch filename for existing links. **Stockgate,
stocks, markets and trading are not part of the Bestcrow MVP.** The current
Next.js campaign creation and detail routes at commit `15cb14a` are
scaffolds. This document is a UI implementation brief, not a completed
feature list. The [protocol and ordered tasks](../docs/IMPLEMENTATION_PLAN.md)
are authoritative for financial rules.

## Audience and product

The first screen should be a usable campaign discovery workspace for
prototype/startup backers, not a charity landing page or a stock dashboard.
Public browsing never requires a wallet. Actions that sign a transaction
show the active network, accounts, SOL amount, 1% fee consequences if
fundraising succeeds, network costs and the exact state transition.

Creator organization information is a **profile claim**, not proof of
verification. Do not add a `verified` badge, an admin acceptance flow,
or a platform co-signature in the MVP. Wallet addresses are public;
participants are pseudonymous rather than anonymous.

## Visual reference

The visual design of the Bestcrow frontend should be inspired by
[Colosseum](https://colosseum.com/). Use it as a reference for the overall
quality, visual hierarchy, typography, spacing, navigation, and presentation
of startup projects. Adapt those ideas to Bestcrow's campaign discovery,
funding, milestone voting, and refund workflows. Do not copy Colosseum's
branding, assets, text, or page layouts literally. Clear financial states,
accessible controls, and legible mobile screens take priority over decorative
similarity.

## Navigation and main journeys

| View | Primary task | Essential content |
| --- | --- | --- |
| Discover | Find a startup project | Search by title, creator or address; funding state, goal, raised amount, deadline and phase filters |
| Campaign | Decide whether to contribute or vote | Canonical verified terms, evidence, 2-5 tranche timeline, progress, current voting window, released/reserved/refundable amounts |
| Create | Prepare and seal complete terms | Draft then lock goal, 7-183 day funding window, 2-5 shares totaling 100%, <=50% each, 0.1 SOL deposit |
| My support | Track and act on contributions | Confirmed deposits, vote eligibility, cancellable funding pledge, claims, refunds and rewards |
| Creator profile | Show who receives funds | Organization details and linked wallet, without platform verification |
| Rewards | Redeem a promised perk | Server-side entitlement after a verified contribution; distinguish entitlement, claim and actual delivery |

Every campaign has a shareable address route. The URL is a locator, not the
only place where its title, description, terms or evidence exists. Fetch
public canonical content, verify its hash against the on-chain commitment
and show a clear mismatch/error state. If the site's server disappears,
another client must still be able to find the terms needed for financial
decisions.

## Create campaign

The creator can edit a draft. Funding starts only after all tranche shares,
deadlines, fee, deposit, recipients and evidence expectations are visible
and committed. This is the irreversible step; show a review screen before
wallet signature. A partially completed multi-transaction draft must be
recoverable, but never accept a contribution before terms are sealed.

Validate at field level before the first transaction:

- goal > 0; funding duration 7-183 days;
- 2-5 positive shares, each <= 50%, sum exactly 100%;
- an initial tranche counted among those shares;
- linked creator wallet, public metadata, canonical hash and all required
  stage periods;
- enough SOL for the separate 0.1 SOL deposit plus rent/network fees.

Do not allow funded terms to be edited through the UI. A cancelled or
failed signature returns to a draft state with explicit error text.

## Campaign detail and actions

Keep the current phase and next eligible action close to the funding
summary. Show gross raised, goal, overfunding, success fee, net tranche
pool, already paid, reserved claim amount, available refund pool and
creator deposit as separate figures. Never display the same lamports as
both claimable and refundable.

An evidence submission opens a seven-day vote. The approval meter uses
**all final contribution weight**, not only votes cast. Label exactly
50% and zero votes as unsuccessful. After a first failure, show all
30 days of improvement and start the second seven-day vote only after
that interval. Show proof and deadline failures and the permissionless
finalization action. A missing creator must not hide a backer's refund
or an approved recipient's payout.

The frontend must derive actions from current on-chain state and confirm
transactions before updating status. Prevent double-click requests,
show errors beside relevant controls and link to a confirmed explorer
transaction. Use icon/tool buttons with labels or tooltips, clear focus
states, compact numeric layout and responsive widths without clipping.
Numbers that affect money stay as integer lamports or precise decimal
strings until formatting.

## Wallets, backend and private data

Wallet connection should start wallet-first sign-in for a backer without
requiring an email/password account. A creator can add organization details
to a profile, with no approval status. `My support` reads verified chain
contributions and can use backend indexing for speed; a stale index is
labeled and never treated as on-chain authority.

The current backend already has password accounts, linked-wallet login,
metadata and payment intents, but the frontend has not integrated them.
Implement or migrate these endpoints after the new program/IDL stabilizes.
Digital reward keys and shipping details stay in private server storage;
do not imply that the Solana escrow guarantees delivery if that server
or the creator disappears.

## Implementation order and acceptance

Follow phases 3 and 4 of [the plan](../docs/IMPLEMENTATION_PLAN.md):
update backend schema, codecs, auth and metadata first, then wire the
campaign and wallet screens. Remove visible legacy `refund_all`, 12-backer
and charity/no-fee copy only when the corresponding target code exists.
The UI must distinguish current from planned features until rollout.

- [ ] A backer can browse, connect, contribute, inspect a confirmed
  pledge and find it under `My support`.
- [ ] A creator can complete a 2-5 tranche draft, review the 1% success
  fee and 0.1 SOL deposit, then seal terms before any pledge.
- [ ] A vote shows >50% of all final contributions and the 7/30/7-day
  timeline; ineligible or early actions do not appear executable.
- [ ] Success, failed goal, missed evidence, failed second vote,
  voluntary termination, split payout and pro-rata refund are visibly
  distinct.
- [ ] Mobile and desktop controls have loading, error, stale, empty
  and confirmed states; monetary values and text remain readable.
