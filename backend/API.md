# Bestcrow Backend API

Read-only indexer + helper API for the **Charity Vault** Solana program. The
indexer watches the chain and serves fast, decoded data so the web client does
not have to query `getProgramAccounts` for every page. It is a **read model**:
the on-chain program is the only authority over funds and state.

- Base URL (local): `http://localhost:4000`
- Content type: `application/json`
- Amounts are **lamports** as decimal **strings** (`u64`); `*Sol` fields give the
  human-readable SOL value alongside.
- Addresses are base58 strings.

## Conventions

### Errors

Every error is JSON:

```json
{ "error": "Campaign not found" }
```

| Status | Meaning |
| --- | --- |
| `400` | Bad/missing query parameter |
| `404` | Resource not found |
| `409` | Conflict (e.g. description hash mismatch) |
| `422` | Request body failed validation (`details` has Zod issues) |
| `500` | Unhandled server error |

### Pagination

List endpoints accept `limit` (1–200, default 50) and `offset` (default 0) and
respond with:

```json
{ "items": [ ... ], "total": 12, "limit": 50, "offset": 0 }
```

---

## System

### `GET /`

Service banner.

```json
{
  "name": "bestcrow-backend",
  "description": "Indexer and REST API for the Bestcrow / Charity Vault Solana program",
  "docs": "/api/program",
  "health": "/api/health"
}
```

### `GET /api/health`

Liveness plus indexer position.

```json
{
  "status": "ok",
  "uptimeSeconds": 61,
  "cluster": "devnet",
  "programId": "74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG",
  "lastIndexedSlot": 507153315,
  "lastSignature": "5FjHCLvm…",
  "timestamp": "2026-10-03T22:44:36.775Z"
}
```

### `GET /api/stats`

Aggregate totals across indexed campaigns.

```json
{
  "campaigns": 7,
  "active": 5,
  "succeeded": 0,
  "refunded": 2,
  "uniqueCreators": 3,
  "totalDonors": 1,
  "totalPledges": 3,
  "totalRaised": "1002110000",
  "totalRaisedSol": "1.00211",
  "totalRefunded": "0",
  "totalRefundedSol": "0"
}
```

### `GET /api/program`

Static program facts useful to a client: id, account sizes, and the Anchor
instruction discriminators (hex).

```json
{
  "programId": "74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG",
  "cluster": "devnet",
  "rpcUrl": "https://api.devnet.solana.com",
  "accounts": {
    "campaign": { "size": 546, "maxDonors": 12 },
    "donorLedger": { "size": 82 }
  },
  "instructions": {
    "createCampaign": "6f83bb62a0c172f4",
    "pledge": "eb2f9cfe0058d48e",
    "finalize": "ab3dda387f730cd9",
    "claimSuccess": "fdec213446628f57",
    "claimRefund": "0f101ea1ffe4613c",
    "refundAll": "ae57de7e173bbd9b"
  }
}
```

### `GET /api/stream`

Server-Sent Events stream of indexer syncs. Emits an initial `hello`, then one
message per poll. Keep-alive comments are sent every 25s.

```text
data: {"type":"hello","slot":507153315}
data: {"type":"sync","slot":507153400,"signature":"…"}
```

---

## Campaigns

### `GET /api/campaigns`

List campaigns with optional filtering.

| Query | Default | Notes |
| --- | --- | --- |
| `status` | — | `active`, `succeeded`, or `refunded` |
| `creator` | — | base58 address |
| `q` | — | substring over address, creator, campaign id, title, description |
| `sort` | `created` | `created`, `deadline`, `raised`, `progress` |
| `order` | `desc` | `asc` or `desc` |
| `limit` / `offset` | 50 / 0 | see pagination |

```bash
curl "localhost:4000/api/campaigns?status=active&sort=progress&limit=10"
```

Response:

```json
{
  "items": [
    {
      "address": "5U3CJYxfzMnMMgt5GMrdNhZcHZ1hjqk9fhCyvmqUoRLC",
      "creator": "F6sXqWU5cCi8Gp8HWZapHzz8XAi21qGLbij5DCoUYg15",
      "campaignId": "1791066887855",
      "goal": "1000000000",
      "goalSol": "1",
      "deadline": 1791066917,
      "deadlineIso": "2026-10-03T22:35:17.000Z",
      "descHash": "0000…0000",
      "raised": "500000000",
      "raisedSol": "0.5",
      "progress": 50,
      "paid": false,
      "status": "active",
      "donorCount": 1,
      "vault": "…",
      "vaultLamports": "650240",
      "vaultLamportsSol": "0.00065024",
      "slot": 507153300,
      "createdAt": 1791067000,
      "updatedAt": 1791067100
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### `GET /api/campaigns/by-pda`

Resolve a campaign from its on-chain seeds instead of its address.

| Query | Required | Notes |
| --- | --- | --- |
| `creator` | yes | base58 address |
| `campaignId` | yes | numeric string (`u64`) |

```bash
curl "localhost:4000/api/campaigns/by-pda?creator=F6sXq…&campaignId=1791066887855"
```

Returns a single campaign object (same shape as an item above, including
`donors` and `metadata`). `404` if not indexed.

### `GET /api/campaigns/:address`

One campaign with its donor ledger and metadata inlined.

```bash
curl localhost:4000/api/campaigns/5U3CJYxfzMnMMgt5GMrdNhZcHZ1hjqk9fhCyvmqUoRLC
```

Adds to the base object:

```json
{
  "donors": [ { "campaign": "…", "donor": "…", "amount": "500000000", "amountSol": "0.5", "claimed": false, "updatedAt": 1791067000 } ],
  "metadata": { "title": "…", "description": "…", "verified": true, "…": "…" }
}
```

### `GET /api/campaigns/:address/donors`

Paged donor ledger (sorted by amount, descending).

```json
{
  "items": [ { "donor": "…", "amount": "500000000", "amountSol": "0.5", "claimed": false } ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### `GET /api/campaigns/:address/events`

Indexed events for the campaign (newest first), reconstructed from Anchor event
logs. `eventName` is one of `CampaignCreated`, `PledgeReceived`,
`CampaignFinalized`, `SuccessClaimed`, `RefundIssued`.

```json
{
  "items": [
    {
      "id": 4,
      "signature": "5FjHC…",
      "slot": 507153315,
      "blockTime": 1791067100,
      "eventName": "RefundIssued",
      "campaign": "…",
      "donor": "…",
      "amount": "500000000",
      "status": null,
      "payload": { "campaign": "…", "donor": "…", "amount": "500000000" },
      "createdAt": 1791067101
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### `GET /api/campaigns/:address/metadata`

Off-chain metadata (title, description, site, image, rewards). `404` if none.

```json
{
  "campaign": "…",
  "title": "Warm meals for 120 families",
  "description": "…",
  "website": "https://…",
  "imageUrl": "https://…",
  "rewards": [ { "title": "Tote bag", "minSol": "0.1", "quantity": 50 } ],
  "verified": true,
  "createdAt": 1791067000,
  "updatedAt": 1791067050
}
```

### `PUT /api/campaigns/:address/metadata`

Store/update metadata. `Content-Type: application/json`, max body 256 KB.

If you send a `description`, its **SHA-256 must equal the campaign's on-chain
`desc_hash`**; otherwise the request fails `409`. On success `verified` is
`true` (a hash match, not a truth claim about the content).

```bash
curl -X PUT localhost:4000/api/campaigns/5U3CJYx…/metadata \
  -H 'content-type: application/json' \
  -d '{"title":"Warm meals","description":"exact on-chain text"}'
```

Body schema:

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string ≤140 | |
| `description` | string ≤20 000 | must hash to `desc_hash` |
| `website` | URL ≤500 | |
| `imageUrl` | URL ≤1000 | |
| `rewards[]` | array ≤20 | `{ title, description?, minSol?, quantity? }` |

At least one field is required (`422` otherwise).

---

## Instruction builders

Stateless helpers that return the **accounts** and **hex instruction data** your
client needs to build a transaction. **No signing and no RPC write happen here.**
Use them to keep client and program in sync without embedding an IDL.

Every response has this shape:

```json
{
  "name": "pledge",
  "programId": "74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG",
  "accounts": [
    { "pubkey": "…", "signer": true,  "writable": true },
    { "pubkey": "…", "signer": false, "writable": true }
  ],
  "dataHex": "eb2f9cfe0058d48e0000000000000000"
}
```

`dataHex` = 8-byte Anchor discriminator + Borsh-encoded arguments.

| Endpoint | Query params | Instruction |
| --- | --- | --- |
| `GET /api/instructions/create` | `creator`, `campaignId`, `goal`, `deadline`, `descHash?` | `create_campaign` |
| `GET /api/instructions/pledge` | `donor`, `campaign`, `amount` | `pledge` |
| `GET /api/instructions/finalize` | `caller`, `campaign` | `finalize` |
| `GET /api/instructions/claim-success` | `creator`, `campaign` | `claim_success` |
| `GET /api/instructions/claim-refund` | `donor`, `campaign` | `claim_refund` |
| `GET /api/instructions/refund-all/:campaign` | `caller` (path: campaign address) | `refund_all` |

Notes:
- `campaignId`, `goal`, `deadline`, `amount` are unsigned-integer strings.
- `descHash` is 32 hex-encoded bytes; omit it to use all-zero bytes.
- `refund-all` pulls the donor list from the indexer and appends two accounts per
  donor. The program caps a campaign at 12 donors so this fits one transaction.
- A client must still, for each account, set the correct signer/writable flags
  as returned, add the fee payer and a recent blockhash, sign, and send.

```bash
curl "localhost:4000/api/instructions/pledge?donor=F6sXq…&campaign=5U3CJYx…&amount=500000000"
```

---

## Notes and limits

- **Not authoritative.** Reads are eventually consistent with the indexer poll
  (`POLL_INTERVAL_MS`); always trust the program for balances and state changes.
- **Donor cap.** The program limits a campaign to 12 donors so `refund_all`
  fits a single legacy transaction.
- **Event history** depends on RPC log retention (`SIGNATURE_SCAN_LIMIT`);
  account state is re-synced in full each poll.
- **Metadata** is only as trustworthy as the hash check: `verified: true` means
  the stored description matches the on-chain commitment, nothing more.
