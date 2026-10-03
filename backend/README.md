# Bestcrow backend

Node.js indexer and REST API for the **Charity Vault** / Bestcrow Solana program
(`rust/programs/charity-vault`). The Next.js client talks to Solana directly for
signing; this service adds the pieces the chain cannot serve cheaply on its own:

- **Indexer** — polls the program's campaign and donor-ledger accounts, parses
  Anchor events from transaction logs, and stores everything in SQLite.
- **REST API** — fast campaign/donor/event listings, aggregate stats, and a
  filterable campaign search.
- **Off-chain metadata** — titles, long descriptions, images, and rewards, with
  the description verified against the on-chain `desc_hash` commitment.
- **Instruction builders** — stateless endpoints that return the accounts and
  hex instruction data any client needs to build a transaction (no signing).

## Requirements

- Node.js >= 22.5 (uses the built-in `node:sqlite` module)
- A Solana RPC endpoint (devnet by default)

## Setup

```bash
cd backend
npm install
cp .env.example .env      # optional; defaults target devnet
npm run dev               # watch mode
```

Production:

```bash
npm run build
npm start
```

Validate:

```bash
npm run typecheck
npm test
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins, or `*` |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | RPC endpoint |
| `CHARITY_VAULT_PROGRAM_ID` | `74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG` | Program id |
| `CLUSTER` | `devnet` | Label used in responses/Explorer links |
| `DB_PATH` | `./data/bestcrow.db` | SQLite file (`:memory:` for ephemeral) |
| `INDEXER_ENABLED` | `true` | Toggle the background indexer |
| `POLL_INTERVAL_MS` | `15000` | Indexer poll interval |
| `SIGNATURE_SCAN_LIMIT` | `200` | Max recent signatures scanned per poll |

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness, last indexed slot/signature |
| `GET` | `/api/stats` | Aggregate campaign/donor/refund totals |
| `GET` | `/api/program` | Program id, account sizes, instruction discriminators |
| `GET` | `/api/campaigns` | List; `status`, `creator`, `q`, `sort` (`created\|deadline\|raised\|progress`), `order`, `limit`, `offset` |
| `GET` | `/api/campaigns/by-pda` | Resolve by `creator` + `campaignId` |
| `GET` | `/api/campaigns/:address` | Campaign with donors and metadata |
| `GET` | `/api/campaigns/:address/donors` | Donor ledger (sorted by amount) |
| `GET` | `/api/campaigns/:address/events` | Indexed event history |
| `GET` | `/api/campaigns/:address/metadata` | Off-chain metadata |
| `PUT` | `/api/campaigns/:address/metadata` | Store metadata; `description` must hash to `desc_hash` or the request fails `409` |
| `GET` | `/api/instructions/create` | Build `create_campaign` (`creator`, `campaignId`, `goal`, `deadline`, `descHash`) |
| `GET` | `/api/instructions/pledge` | Build `pledge` (`donor`, `campaign`, `amount`) |
| `GET` | `/api/instructions/finalize` | Build `finalize` (`caller`, `campaign`) |
| `GET` | `/api/instructions/claim-success` | Build `claim_success` (`creator`, `campaign`) |
| `GET` | `/api/instructions/claim-refund` | Build `claim_refund` (`donor`, `campaign`) |
| `GET` | `/api/instructions/refund-all/:campaign` | Build `refund_all` using indexed donors + `caller` |
| `GET` | `/api/stream` | Server-Sent Events stream of indexer syncs |

All amounts are lamports as decimal strings (`u64`); SOL equivalents are provided
alongside as `*Sol` fields.

### Example

```bash
curl localhost:4000/api/campaigns?status=active&sort=progress
curl localhost:4000/api/campaigns/So11111111111111111111111111111111111111112
```

## Architecture

```
src/
  index.ts             entrypoint: server + indexer + graceful shutdown
  config.ts            env loading (no dotenv dependency)
  db/index.ts          node:sqlite schema + Store access layer
  solana/
    program.ts         program id, PDAs, account decoders, instruction plans
    events.ts          Anchor event decoding from transaction logs
    rpc.ts             @solana/kit RPC wrappers
    indexer.ts         polling sync: accounts, ledgers, events
  services/campaigns.ts DTOs, filtering/sorting, stats, hash verification
  api/
    server.ts          express app
    routes/            campaigns, system, instructions
    middleware/error.ts typed errors + async wrapper
```

The indexer never trusts its own database for authorization — it is a read model.
The on-chain program remains the sole authority over funds and state transitions.

## Notes and limits

- Off-chain metadata is only as trustworthy as the hash check: a `verified: true`
  record means the stored description matches the on-chain SHA-256 commitment.
- The program caps a campaign at 12 donors, so `refund_all` fits in one legacy
  transaction.
- Event reconstruction depends on RPC log retention (`SIGNATURE_SCAN_LIMIT`);
  account state is always re-synced in full each poll.
