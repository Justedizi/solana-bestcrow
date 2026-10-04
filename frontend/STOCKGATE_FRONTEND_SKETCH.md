# Stockgate frontend sketch

Stockgate is the working frontend direction for a crypto-native funding and market
dashboard. The visual target combines the information hierarchy of Kickstarter,
the protocol-first structure of MetaDAO, and the ecosystem/product architecture
of Colosseum.

The current frontend remains a bare scaffold. This document describes the next
implementation direction; it does not add wallet actions, campaign transactions,
market data, or trading behavior by itself.

## Product position

Stockgate should feel like a public crypto terminal for things people are funding,
watching, and evaluating.

The first vertical is the existing Charity Vault flow:

- creators publish campaigns;
- backers fund campaigns through Solana;
- milestone progress and release rules stay visible;
- remaining refundable funds stay distinct from released funds.

Stocks are a later vertical. The initial stocks work should be read-only market
data and watchlists. It must not quietly turn reward-based crowdfunding into
equity, an investment product, or a trading promise.

## Reference translation

### Kickstarter: page composition

Use Kickstarter as the reference for where information belongs on a project page:

- project identity is visible immediately;
- the primary media or project state has the first-viewport position;
- funding progress, target, deadline, and the main action sit together;
- the story follows the funding summary;
- rewards, updates, backers, and activity are separate sections;
- the creator identity remains easy to find.

Stockgate should borrow the information order and repeated action patterns, not
Kickstarter's branding, copy, illustrations, or exact visual treatment.

### MetaDAO: protocol structure

Use MetaDAO as the reference for protocol-aware product structure:

- show state before action;
- make the current phase, rules, thresholds, and evidence explicit;
- separate proposals, participation, outcomes, and settlement;
- use compact metrics and clear status labels;
- treat actions as transactions with visible consequences;
- show what is on-chain, what is indexed, and what is only an off-chain display.

This is especially useful for milestone votes and future stock market data, where
users need to understand freshness, source, and status before acting.

### Colosseum: design architecture

Use Colosseum as the reference for the product system rather than a single page:

- establish a reusable shell and page grammar;
- build small primitives that work across campaigns and markets;
- make ecosystem context visible without turning every screen into a landing page;
- keep the information density high enough for repeated use;
- make the system feel like a tool used by builders, backers, and crypto operators.

The result should be a working application surface first, with promotional content
kept secondary.

## Visual direction

The tone is pixel-forward, crypto-native, and slightly crypto-bro without becoming
noisy or unserious.

### Pixel language

- hard 1px or 2px borders;
- square or nearly square corners, usually `rounded-none` or `rounded-sm`;
- compact monospace labels for state, chain, block, slot, and transaction data;
- hard offset shadows instead of soft floating shadows;
- pixel dividers, grid lines, and small status blocks;
- visible empty states instead of decorative filler;
- no gradients, illustrations, badges, or visual effects in the current scaffold;
- introduce decorative pixel art later as a deliberate asset layer.

### Palette direction

Keep the base mostly black, white, and cool gray. Use bright accents as signals:

| Role | Direction |
| --- | --- |
| Base | near-black ink, paper white, cool gray |
| Positive | electric green for funded, approved, or live |
| Attention | acid yellow for pending, revision, or stale data |
| Action | cyan or blue for links and selected controls |
| Risk | hot pink or red for rejected, failed, or terminated |
| Chain | purple used sparingly for Solana identity |

The colors communicate state. They should not become a wall of neon.

### Voice

Use short, concrete labels:

```text
LIVE
RAISED
ESCROWED
BACKERS
MILESTONE 03
VOTE OPEN
FINALIZED
STALE QUOTE
VIEW TX
```

Use crypto-native language where it adds clarity: `vault`, `escrow`, `slot`,
`signature`, `proof`, `settlement`, `oracle`, `quote`, and `watchlist`.

Avoid hype such as “guaranteed upside,” “risk-free,” “moon,” or language that
implies campaign backers receive equity. The visual can be playful while the
financial claims remain exact.

## Global shell

The shell is shared by campaign and market routes.

```text
┌─────────────────────────────────────────────────────────────────┐
│ STOCKGATE     FUND     DISCOVER     MARKETS     WATCHLIST   WALLET │
├─────────────────────────────────────────────────────────────────┤
│ page context / network / indexer status                         │
│                                                                 │
│ route content                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Header

Desktop:

- left: `STOCKGATE` wordmark;
- center: `Fund`, `Discover`, `Markets`, `Watchlist`;
- right: network selector/status and wallet connection state.

Mobile:

- left: wordmark;
- right: network and menu buttons;
- navigation opens as a plain stacked panel with no decorative overlay.

The wallet control remains disconnected by default. Connecting a wallet must be a
user action. The header should show the active network before any signing action.

### Network strip

Place a compact status strip under the header when data is available:

```text
DEVNET  ·  PROGRAM ONLINE  ·  INDEXED SLOT 123456789  ·  DATA UPDATED 4s AGO
```

On stale or failed data, show the state plainly. Do not make a failed request look
like an empty campaign list or an empty market.

## Information architecture

```text
app/
  page.tsx                         home / fund overview
  discover/page.tsx                campaign discovery
  campaign/new/page.tsx            create campaign placeholder, then flow
  campaign/[address]/page.tsx      campaign detail and settlement state
  markets/page.tsx                 future read-only market overview
  markets/[symbol]/page.tsx       future asset detail
  watchlist/page.tsx               future saved assets and campaigns
  portfolio/page.tsx               future wallet positions and campaign activity
  settings/page.tsx                network, display, and data-source settings

  components/
    app-shell.tsx
    site-header.tsx
    network-strip.tsx
    pixel-label.tsx
    status-indicator.tsx
    metric.tsx
    data-table.tsx
    empty-state.tsx
    error-state.tsx
    transaction-link.tsx

  features/
    campaigns/
      campaign-card.tsx
      campaign-hero.tsx
      funding-summary.tsx
      milestone-timeline.tsx
      evidence-panel.tsx
      vote-panel.tsx
      reward-list.tsx
      hooks.ts
      types.ts
    markets/
      market-card.tsx
      quote-table.tsx
      price-chart.tsx
      market-status.tsx
      hooks.ts
      types.ts
    wallet/
      wallet-button.tsx
      wallet-state.ts
    watchlist/
      watchlist-button.tsx
      hooks.ts
```

The existing `app/lib/` Solana helpers stay as the low-level program boundary.
The UI should call feature hooks and services rather than importing PDA or account
decoding functions inside presentational components.

## Home / fund overview

The homepage should be a working dashboard, not a marketing hero.

```text
┌─────────────────────────────────────────────────────────────────┐
│ FUND / OVERVIEW                              DEVNET              │
│ Back campaigns with visible rules and settlement state.          │
├─────────────────────────────────────────────────────────────────┤
│ ACTIVE CAMPAIGNS   ESCROWED SOL   BACKERS   MILESTONES REVIEWED  │
├─────────────────────────────────────────────────────────────────┤
│ FEATURED CAMPAIGN / primary campaign state                        │
│ progress · goal · deadline · next milestone · VIEW CAMPAIGN      │
├───────────────────────────────┬─────────────────────────────────┤
│ LIVE CAMPAIGNS                 │ RECENT SETTLEMENTS              │
│ campaign cards                │ signatures / releases / refunds │
└───────────────────────────────┴─────────────────────────────────┘
```

The featured campaign follows Kickstarter's project hierarchy: identity, primary
state, funding summary, and action in one view. The metrics and settlement stream
follow MetaDAO's protocol dashboard pattern.

## Campaign discovery

`/discover` is a dense browse surface:

- search by title, creator, address, or campaign ID;
- filter by `active`, `succeeded`, `refunded`, `revision`, and `terminated`;
- sort by deadline, raised amount, progress, or newest;
- show a compact campaign card with progress, escrow, backers, next milestone,
  and last indexed update;
- keep campaign links shareable and deterministic.

Campaign cards should be rectangular information blocks with one clear action.
Avoid decorative cards nested inside other cards.

## Campaign detail

`/campaign/[address]` is the most important page. It should follow this order:

1. project identity and campaign status;
2. primary campaign media or evidence placeholder;
3. funding summary and next permissible action;
4. milestone timeline;
5. evidence and vote state;
6. rewards and fulfilment state;
7. backer activity and transaction links;
8. immutable terms and technical proof.

### Desktop layout

```text
┌─────────────────────────────────────────────────────────────────┐
│ CAMPAIGN #123                 ACTIVE / DEVNET / VIEW PROGRAM     │
├───────────────────────────────┬─────────────────────────────────┤
│ campaign media / evidence      │ RAISED      3.2 / 10 SOL       │
│ title, creator, description     │ ESCROWED    2.4 SOL            │
│                               │ DEADLINE    4d 06h             │
│                               │ [BACK THIS CAMPAIGN]            │
├───────────────────────────────┴─────────────────────────────────┤
│ MILESTONE TIMELINE                                               │
│ 01 APPROVED ── 02 VOTE OPEN ── 03 PENDING ── 04 PENDING          │
├─────────────────────────────────────────────────────────────────┤
│ EVIDENCE / VOTE / BACKER ACTIVITY / TERMS                        │
└─────────────────────────────────────────────────────────────────┘
```

The right-side summary is sticky on desktop only when it improves repeated use.
On mobile, it appears directly below the project identity before the timeline.

### State vocabulary

Use explicit states instead of relying on color alone:

| State | Meaning |
| --- | --- |
| `ACTIVE` | Campaign accepts contributions under its fixed terms |
| `SUCCEEDED` | Goal reached and success finalized |
| `REFUNDED` | Goal missed and donor refunds enabled |
| `VOTE OPEN` | Backers can review and vote on evidence |
| `REVISION` | First vote did not pass; improvement window is open |
| `TERMINATED` | Remaining refundable pool is frozen for claims |
| `STALE` | Indexed or market data is older than the allowed freshness window |

## Future markets / stocks vertical

Stocks should arrive as a separate product area, not as extra fields on campaign
components.

### First version: read-only markets

The first markets release should provide:

- market overview;
- symbol search;
- quote cards;
- compact price/change table;
- asset detail with source, timestamp, and freshness;
- watchlist stored per user/account;
- wallet holdings only when the data source can support them honestly.

Do not add buy/sell buttons until custody, asset representation, jurisdiction,
execution venue, settlement, and legal requirements are explicitly decided.

### Market overview layout

```text
┌─────────────────────────────────────────────────────────────────┐
│ MARKETS                                      DATA UPDATED 12s AGO │
│ Search symbol or asset name                                      │
├─────────────────────────────────────────────────────────────────┤
│ WATCHLIST                                                        │
│ BTC/USD   $...   +...%     SOL/USD   $...   -...%                │
├─────────────────────────────────────────────────────────────────┤
│ MARKET TABLE                                                     │
│ SYMBOL  LAST  24H  VOLUME  SOURCE  UPDATED                      │
└─────────────────────────────────────────────────────────────────┘
```

### Asset detail layout

```text
┌─────────────────────────────────────────────────────────────────┐
│ SOL / SOLANA           WATCHLIST                                │
│ $...  +...%  24H       source: provider · updated: 8s ago        │
├───────────────────────────────┬─────────────────────────────────┤
│ price chart placeholder         │ KEY DATA                        │
│ range: 1D 1W 1M 1Y             │ volume / high / low / source     │
├───────────────────────────────┴─────────────────────────────────┤
│ DISCLOSURE: read-only market data; not a recommendation.          │
└─────────────────────────────────────────────────────────────────┘
```

Campaigns and assets can share `metric`, `status`, `timestamp`, `data-table`, and
`empty-state` primitives, but their domain components stay separate.

## Component contracts

### Shared primitives

```ts
type Status = 'live' | 'pending' | 'success' | 'warning' | 'error' | 'stale';

type MetricProps = {
  label: string;
  value: string;
  detail?: string;
  status?: Status;
};

type StatusIndicatorProps = {
  label: string;
  status: Status;
  detail?: string;
};
```

Primitives must:

- accept text labels rather than infer meaning from color;
- remain stable when loading/error text changes;
- have keyboard-visible focus states;
- support narrow mobile widths without clipping data.

### Campaign feature types

```ts
type CampaignSummary = {
  address: string;
  title: string | null;
  creator: string;
  status: string;
  raisedLamports: string;
  goalLamports: string;
  deadline: number;
  donorCount: number;
  nextMilestone?: string;
  updatedAt: number;
};

type MilestoneView = {
  index: number;
  title: string;
  status: string;
  amountLamports: string;
  evidenceHash?: string;
  vote?: { yesWeight: string; totalWeight: string; deadline: number };
};
```

`CampaignSummary` is suitable for cards and tables. `CampaignDetail` and
`MilestoneView` belong on the detail route. No component should format lamports by
converting them through JavaScript `number` when precision matters.

### Future market types

```ts
type Quote = {
  symbol: string;
  name: string;
  price: string;
  change24h: string;
  volume24h?: string;
  source: string;
  observedAt: number;
  staleAfterSeconds: number;
};

type WatchlistItem = {
  id: string;
  userId: string;
  kind: 'campaign' | 'asset';
  key: string;
  createdAt: number;
};
```

Quotes are provider data, not on-chain truth. The UI must show source and observed
time. A missing quote is an error/empty state, not a zero price.

## Hooks and data boundaries

Hooks should own loading, error, refresh, and cache behavior. Presentational
components should receive data and callbacks.

```text
useCampaigns(filters)
useCampaign(address)
useCampaignEvents(address)
useWallet()
useTransactionStatus(signature)

future:
useQuotes(symbols)
useQuote(symbol)
useWatchlist()
usePortfolio()
```

Data ownership:

```text
chain sector     -> on-chain campaign state, PDAs, signatures, evidence hashes
accounts sector  -> users, sessions, linked wallets, payment intents, watchlists
market sector    -> quote provider adapter, normalized quotes, freshness metadata
frontend hooks   -> loading/error/cache/view state only
```

The market sector should be a new backend/provider boundary later. Do not make
campaign components call a quote provider directly from the browser.

## Tailwind implementation

The current frontend uses Tailwind v4 through `@tailwindcss/postcss` and keeps
`app/globals.css` intentionally small. Later styling should be utility-first:

```css
@import "tailwindcss";

@theme {
  --font-sans: "IBM Plex Mono", ui-monospace, monospace;
  --color-ink: #101114;
  --color-paper: #f7f7f2;
  --color-grid: #d9dadd;
  --color-signal: #b7ff00;
  --color-cyan: #33d6ff;
  --color-pink: #ff4fa3;
  --color-chain: #9945ff;
}
```

Build visual primitives with classes such as:

```tsx
<section className="border-2 border-ink bg-paper p-4 shadow-[4px_4px_0_0_theme(--color-ink)]">
  <p className="font-mono text-xs uppercase tracking-wide text-slate-600">Escrowed</p>
  <p className="font-mono text-2xl tabular-nums">2.40 SOL</p>
</section>
```

Do not create a large bespoke stylesheet for each page. Keep the pixel vocabulary
in primitives and compose it through Tailwind classes. Add art, textures, and
animations only after the information hierarchy works in plain mode.

## Implementation sequence

### Phase 0: current scaffold

- keep routes available;
- keep Solana helpers and tests dormant;
- no wallet auto-connect;
- no RPC polling from visible pages;
- no decorative visual system.

### Phase 1: Stockgate shell

- add `AppShell`, `SiteHeader`, `NetworkStrip`, `StatusIndicator`, and `EmptyState`;
- add a route-aware navigation model;
- add explicit loading, error, and stale states;
- connect only read-only campaign data from the existing chain/backend APIs;
- keep the page usable without a wallet.

### Phase 2: campaign vertical

- implement Kickstarter-style campaign cards and detail hierarchy;
- implement milestone timeline and evidence panels;
- add wallet connection only at the action boundary;
- keep transaction summaries visible before signing;
- preserve the existing Solana program/account boundaries.

### Phase 3: read-only markets

- add the markets route and asset detail route;
- add a backend market-provider adapter;
- normalize provider quotes and freshness;
- add watchlists without trading;
- test stale, unavailable, delayed, and conflicting provider data.

### Phase 4: portfolio and account context

- show campaign contributions, claims, and linked wallets;
- add a combined watchlist for campaigns and assets;
- keep market holdings distinct from campaign backer balances;
- show network and account context on every transaction-capable view.

### Phase 5: execution decisions

Only after the team decides what “stocks” means should the UI consider orders,
tokenized assets, swaps, or broker integrations. That phase needs a separate
protocol, custody, legal, and security design. It is not implied by this frontend
sketch.

## Acceptance checklist

- [ ] The first viewport shows product state and the next useful action.
- [ ] Campaign pages distinguish raised, released, escrowed, and refundable funds.
- [ ] Milestone status and vote thresholds are readable without color alone.
- [ ] Every transaction action shows network, accounts, amount, and expected effect.
- [ ] Read-only market data shows source, observed time, and stale state.
- [ ] No stock screen implies equity ownership, guaranteed returns, or execution before it exists.
- [ ] Wallet connection is user initiated and never required to browse public data.
- [ ] Mobile layouts preserve table values and action labels without overlap.
- [ ] The visual system uses Tailwind primitives instead of per-page decoration.
- [ ] Campaign and market data services remain separate.

## References

- [Kickstarter](https://www.kickstarter.com) — project-page hierarchy and funding UX reference.
- [MetaDAO](https://metadao.fi) — protocol, proposal, state, and participation structure reference.
- [Colosseum](https://colosseum.com) — ecosystem/product architecture and builder-oriented presentation reference.
- [Bestcrow project model](../agents/PROJECT.md) — current crowdfunding rules and trust boundary.
- [Frontend scaffold](./README.md) — current implementation state.

