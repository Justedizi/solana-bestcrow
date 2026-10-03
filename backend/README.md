# Bestcrow v2 TypeScript backend

The API reads Anchor accounts through the generated `@bestcrow/client` decoder and prepares unsigned instructions. The keeper polls for eligible actions every 30 seconds. It can dispatch those actions when explicitly configured with a separate keeper keypair; by default it only reports them.

## Run

Requires Node.js 22.16 or newer.

```sh
npm ci --ignore-scripts
npm run check
cp .env.example .env  # optional local overrides
npm start
```

Docker: from the repository root, copy `backend/.env.example` to `.env` if overrides
are needed, then run `docker compose --profile backend up --build -d backend`.
Health: `GET http://127.0.0.1:3001/health` by default. Set `POLL_MS=0` to disable polling.

## Configuration

| Variable | Default | Use |
| --- | --- | --- |
| `RPC_URL` | Devnet RPC | Solana JSON RPC endpoint |
| `HOST` / `PORT` | `0.0.0.0` / `3001` | HTTP bind address and port |
| `MAX_BODY_BYTES` | `16384` | Maximum JSON request size |
| `POLL_MS` | `30000` | Keeper scan interval; `0` disables it |
| `STAGEGATE_PROGRAM_ID` | `EousWVK...` | StageGate program in `rust/programs/bestcrow/src/lib.rs` |
| `META_DAO_PROGRAM_ID` | `FUTARELB...` | MetaDAO futarchy program |
| `CONDITIONAL_VAULT_PROGRAM_ID` | `VLTX1ish...` | MetaDAO conditional vault program |
| `USDC_MINTS` | Devnet and mainnet USDC | Comma-separated accepted quote mints |
| `KEEPER_AUTOSEND` | `0` | Optional operator transaction dispatcher |
| `KEEPER_KEYPAIR_PATH` | unset | External operator keypair path when autosend is enabled |

The backend uses `BackendConfig` for validated environment settings, `SolanaGateway`
for RPC and account decoding, `MetaDaoService` for proposal preparation,
`KeeperService` for action selection and unsigned instructions, and `ApiServer`
for HTTP routing. Tests live in `backend/test/`.

The generated client and IDL use the declared Bestcrow program ID. The backend
also accepts `STAGEGATE_PROGRAM_ID` so a deployment can configure its actual ID.
The backend's `.npmrc` installs its local `@bestcrow/client` dependency as a
package copy, so clean CI and Docker builds resolve its Solana dependencies.

## Routes

| Route | Result |
| --- | --- |
| `GET /health` | Service status and RPC endpoint |
| `GET /campaigns` | All decoded StageGate campaigns |
| `GET /campaigns/:address` | One campaign |
| `GET /campaigns/:address/action` | Current keeper action; `?caller=<pubkey>` adds unsigned instruction data |
| `GET /campaigns/:address/refund?wallet=<pubkey>&caller=<pubkey>` | Eligible backer's amount and unsigned refund instruction |
| `GET /keeper/actions` | All currently eligible transitions |
| `POST /meta-dao/prepare` | Unsigned MetaDAO proposal instruction groups |
| `GET /campaigns/:address/market?milestone=N` | Campaign-bound market state, token decimals and indicative prices |
| `POST /campaigns/:address/market/prepare` | Unsigned conditional split/swap groups for Pass or Fail |
| `POST /campaigns/:address/market/redeem` | Unsigned winning-token redemption groups after finalization |

`POST /meta-dao/prepare` takes `operation` (`initialize`, `stake`, `launch`, `finalize`), `payer`, `dao`, `baseMint`, `quoteMint`, `squadsProposal`, and optionally `proposal` and `amount` (for staking, in base token units). `initialize` returns three ordered transaction groups: question creation, two conditional vaults together, and proposal initialization. The Squads proposal and funded MetaDAO DAO must already exist. Other operations return one group. Every instruction is `{programId, accounts: [{address,isSigner,isWritable}], data}` with base64 instruction data. The client wallet adds a recent blockhash, signs, and submits; the API never signs these requests.

The backend uses the pinned official `@metadaoproject/programs` SDK for MetaDAO instruction preparation. It uses the Anchor-generated Codama client for StageGate account decoding and instructions. Proposal state comes from MetaDAO-owned accounts. Its deployment to any target cluster must be checked separately; public devnet RPC rate limits prevented confirming MetaDAO availability during development.

The pinned MetaDAO SDK depends on older Anchor/Solana packages. `npm audit --omit=dev` currently reports 15 advisories, including 7 high-severity transitive advisories. This local prototype should not be exposed as a public production service before dependency review and security testing.

## Keeper dispatcher

For a self-hosted operator, set `KEEPER_AUTOSEND=1` and `KEEPER_KEYPAIR_PATH` to an existing Solana keypair file **outside this repository**. The keeper then signs only currently eligible permissionless finalization, timeout and resolution instructions, rechecking campaign state immediately before sending. A failed transaction is logged and retried on the next poll. Do not set these variables for a read-only API. In Docker, mount the external file read-only and set its container path with a Compose override. No keypair is generated or committed here.

Keeper actions are: finalize funding below goal, expire a pending/reviewing milestone, finalize a mature MetaDAO proposal, and resolve a finalized MetaDAO result. MetaDAO's market duration must be at least 24 hours. No bot is required for a user to invoke any of these transitions.

The trade-preparation body is `{wallet,side,direction,amount,minReceived,useExistingConditional?}`:
`side` is `pass` or `fail`, `direction` is `buy` or `sell`, and both
amounts are human-readable decimal token amounts. `minReceived` must be
positive; the MetaDAO swap enforces it on chain. A buy returns a conditional
USDC split transaction and then a swap transaction. Set
`useExistingConditional: true` only when the wallet already holds the
corresponding conditional USDC. Redemption takes `{wallet,milestone}` with a
one-based milestone number and returns transactions for nonzero winning token
balances. The caller's wallet signs all transactions.
