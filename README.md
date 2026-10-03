# Bestcrow v2

Bestcrow v2 is a Solana milestone crowdfunding prototype. The Anchor program holds backer USDC in an SPL escrow. Reaching the exact funding goal releases a capped kickoff tranche. Each later tranche is released only when its precommitted MetaDAO futarchy proposal finalizes as `Passed`. A failed proposal or deadline freezes the unreleased balance for permissionless pro-rata refunds. The old SOL Charity Vault implementation remains in the `main` branch and its Git history; `v2` uses the MetaDAO model instead of contribution-weighted backer voting.

## What is in this branch

- `rust/`: Anchor program, five to ten ordered milestones, USDC escrow, immutable DAO/proposal bindings, deadlines and refunds. The kickoff is at most 30% of the goal; no milestone can exceed 50%; all tranches sum to the goal.
- `backend/`: class-based TypeScript API, campaign decoder, MetaDAO proposal/trade instruction preparation, and a read-only keeper by default. Wallets sign the returned instructions.
- `frontend/`: barebone Next.js app with a campaign-address lookup and Pass/Fail buy, sell and redeem screen at `/campaign/<address>/market`.
- `compose.yaml`: API, frontend, optional Anchor build container and empty local validator.

## Run the API and frontend

```sh
docker compose --profile backend --profile frontend up --build -d backend frontend
curl http://127.0.0.1:3001/health
```

Open `http://localhost:3000`. Stop with `docker compose --profile backend --profile frontend down`. Optional settings are in `.env.example`. The same launch command is available as `scripts/up.sh` (foreground mode). The backend uses port 3001 and the frontend port 3000.

The frontend and API can start without a campaign. **Trading needs a deployed Bestcrow v2 program and compatible, funded MetaDAO DAO on the same Solana cluster.** The program ID in this repository is a placeholder; the previous `main` branch's Charity Vault deployment is a different program. Docker does not deploy either program or create a MetaDAO market. No live Pass/Fail transaction has been verified for this branch.

If another stack already uses ports 3000/3001, set `FRONTEND_HOST_PORT=3100` and `BACKEND_HOST_PORT=3101` in the root `.env` before running Compose. Open `http://localhost:3100` and check `http://127.0.0.1:3101/health` in that case.

## Build and check

```sh
(cd rust && cargo test --workspace)
(cd rust && npm ci --ignore-scripts && npm run check:client)
(cd backend && npm ci --ignore-scripts && npm run check && npm test)
(cd frontend && npm ci --ignore-scripts && npm run check && npm run build)
```

For an SBF build, use the pinned Anchor container:

```sh
docker compose --profile tools run --rm anchor cargo build-sbf --manifest-path programs/bestcrow/Cargo.toml --sbf-out-dir /tmp/bestcrow-sbf --arch v0
```

See `rust/README.md` for accounts, instructions and upgrade authority, `backend/README.md` for API routes, and `frontend/README.md` for the trading flow. The generated IDL and client use the declared Bestcrow program ID; set a real deployed ID consistently before using a live cluster.

## Campaign and market setup

1. The creator supplies a project token `base_mint`, a supported Circle USDC `quote_mint`, and a MetaDAO v0.6 DAO bound to that pair. The DAO spot pool must have enough base and USDC to seed both conditional markets.
2. Create an active Squads proposal, MetaDAO question, conditional vaults and a separate Draft proposal for each of five to ten milestones. `POST /meta-dao/prepare` helps prepare unsigned instructions. Proposal stake and market liquidity are separate from backer escrow.
3. Call `create_campaign` with the ordered Draft proposal accounts. It fixes the goal, dates, tranche amounts, metadata hash, mints and DAO. Backers pledge USDC. The creator submits evidence and launches each precommitted proposal in order.
4. MetaDAO finalizes its own Pass/Fail outcome. Anyone can pass the finalized account to `resolve_milestone`. A `Passed` result releases the tranche; a `Failed` result or enforceable timeout enables claims on the unreleased USDC.

MetaDAO proposals take at least 24 hours in this integration. A weakly liquid `base_mint` can make market prices manipulable. Wallet addresses, deposits and trades are public, so participation is pseudonymous. Previously released funds cannot be recovered by the escrow. An active Solana upgrade authority can change the program; check it with `scripts/check-upgrade-authority.sh` after deployment.

## Verification boundary

The [challenge criteria, pp. 2–3](docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf) call for a complete working flow and on-chain enforcement of the intermediary-replacing logic. Unit builds and an API health response verify only local components. A challenge-ready demo still needs a deployed program, funded MetaDAO markets, and confirmed create → pledge → trade → resolution → payout/refund transactions. The [competition rules](docs/RULES%20Finance%20Without%20Intermediaries.pdf) remain the primary source for submission requirements.

The documents in `agents/`, `EXECUTION_PLAN.md` and `INSPIRATIONS.md` record earlier Charity Vault and weighted-voting proposals. They are historical design context for this branch; this README and the v2 source describe what is currently implemented.
