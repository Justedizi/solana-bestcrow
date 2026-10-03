# Bestcrow v2 frontend

Next.js App Router project with a backend health view and a MetaDAO Pass/Fail
trading screen at `/campaign/<campaign-address>/market`. The home page accepts
a campaign address. The screen supports Phantom and Solflare wallets, buying
and selling in either conditional market, and redemption after finalization.
The backend status checks `/api/health` every five seconds and updates after a
backend restart without reloading the page.

The structure is class first for application logic:

- `src/config/FrontendConfig.ts` validates environment settings.
- `src/services/BackendApiClient.ts` owns backend HTTP calls.
- `src/services/MarketApiClient.ts` reads market snapshots and unsigned transactions.
- `src/services/TradeTransactionService.ts` sends wallet-signed transactions.
- `src/models/` contains validated response and page models.
- `src/app/` contains thin Next.js route components and minimal CSS.

Next.js requires `page.tsx` and `layout.tsx` to export components. They remain
small function components; stateful domain and API behavior stays in classes.

## Run locally

```sh
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The page also renders when the backend is offline.
For production checks, run `npm run check` and `npm run build`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKEND_URL` | `http://127.0.0.1:3001` | Server-side backend address |
| `BACKEND_TIMEOUT_MS` | `1500` | Health request timeout (100–30000 ms) |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Devnet RPC | Browser RPC used by wallets; must target the same cluster as backend `RPC_URL` |
| `NEXT_PUBLIC_META_DAO_PROGRAM_ID` | MetaDAO v0.6 ID | Allowed trading program ID; match backend configuration |
| `NEXT_PUBLIC_CONDITIONAL_VAULT_PROGRAM_ID` | MetaDAO vault ID | Allowed conditional vault program ID; match backend configuration |

For Docker Compose, set `FRONTEND_BACKEND_URL` in the repository root `.env` if
the backend is elsewhere. The default Compose address is `http://backend:3001`.
Set `FRONTEND_SOLANA_RPC_URL` in the root Compose environment to override
the browser RPC at image build time.

## Trading flow

The browser asks the backend for campaign-bound, unsigned MetaDAO v0.6
instructions. It never sends a private key. A buy first splits ordinary USDC
into Pass and Fail conditional USDC, then swaps the chosen side into a
conditional project token. These are separate wallet transactions. If the
second transaction fails, the conditional USDC remains in the wallet; select
“Use conditional USDC already in my wallet” to retry the swap without splitting
again. A sell spends conditional project tokens. Once MetaDAO finalizes a
proposal, use “Redeem winning tokens” to return winning conditional tokens to
their underlying tokens.

The shown Pass/Fail mid prices are indicative reserve ratios, not executable
quotes. The trader must enter a positive minimum received amount. The on-chain
MetaDAO instruction enforces this amount to limit slippage. This prototype has
no automatic quote or portfolio view; verify token amounts before signing.
No on-chain trade was submitted during development.
