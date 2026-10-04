# Accounts API

This page documents **implemented routes**. The wallet-first backer experience
and creator organization profile described below are MVP requirements, not
available endpoints.

Base URL: `http://localhost:4000`. Requests and responses use JSON. Protected routes
require `Authorization: Bearer <token>`. Account timestamps are Unix seconds;
monetary amounts are decimal lamport strings. The backend holds no wallet keys.

## Routes

| Method | Path | Authentication | Input / result |
| --- | --- | --- | --- |
| POST | `/api/accounts/auth/register` | Public | `{email,password,displayName?}` -> session, `201` |
| POST | `/api/accounts/auth/login` | Public | `{email,password}` -> session |
| POST | `/api/accounts/auth/wallet-login` | Public | `{challengeId,signatureBase64}` -> session |
| POST | `/api/accounts/auth/logout` | Session | Revokes current session -> `{ok:true}` |
| GET | `/api/accounts/me` | Session | `{user,wallets}` |
| POST | `/api/accounts/wallets/challenge` | Session for `link`, public for `login` | `{address,purpose:"link"\|"login"}` -> `{id,message,expiresAt}`, `201` |
| POST | `/api/accounts/wallets/link` | Session | `{challengeId,signatureBase64}` -> wallet, `201` |
| GET | `/api/accounts/wallets` | Session | Current account's wallet array |
| DELETE | `/api/accounts/wallets/:address` | Session | Removes wallet link -> `{ok:true}` |
| POST | `/api/accounts/payments` | Session | `{campaign,wallet,amount}` -> payment intent, `201` |
| GET | `/api/accounts/payments` | Session | Current account's payment array |
| GET | `/api/accounts/payments/:id` | Session | Current account's payment |
| POST | `/api/accounts/payments/:id/confirm` | Session | `{signature}` -> finalized payment |

Session response:

```json
{
  "user": { "id": "uuid", "email": "user@example.com", "displayName": "User", "createdAt": 1800000000 },
  "token": "opaque-session-token",
  "expiresAt": 1800086400
}
```

A wallet has `{id,userId,address,createdAt}`. A payment has
`{id,userId,campaign,wallet,amount,status,signature,createdAt,expiresAt,confirmedAt,
instruction,memoInstruction,reference,cluster}`. Status is `pending` or `confirmed`.
The payments list only contains intents created through this API. It is not a
complete history of a wallet's on-chain pledges or refunds.

## Register, link and log in

1. Register with an email and a 12-128 character password. Emails are normalized
   and checked for format; email delivery and ownership verification are not
   included. Passwords use salted scrypt hashes.
2. Use the returned token for protected requests. Tokens are random, expire after
   the configured lifetime and are stored only as SHA-256 hashes. Logout revokes
   the current session.
3. Request a `link` challenge for the connected Phantom address. Sign the exact
   UTF-8 bytes of `message` with Phantom's `signMessage`.
4. Submit the challenge ID and signature encoded as standard base64. The server
   verifies Ed25519 ownership, account, address, action and expiry, then consumes
   the challenge. A wallet can be linked to only one account at a time.
5. A linked wallet can request a fresh `login` challenge and sign in without a
   password. A link proof cannot be used as a login proof.

The signed message includes the configured application origin, network, account,
wallet, random nonce and validity period. It does not authorize moving funds.

## Make a payment

Payment handling currently means a SOL pledge to the legacy Charity Vault
program. `amount` must be a positive `u64` decimal string; `100000000` means
0.1 SOL.

1. Create an intent with a wallet linked to the authenticated account.
2. Convert `instruction` and `memoInstruction` to Kit instructions. Preserve all
   account order, signer/writable flags and hex bytes. Include both in one
   transaction; the signed memo ties this payment to this intent.
3. Simulate the transaction, obtain the user's Phantom signature and submit from
   the frontend. Prefer v1 when the wallet advertises support; use v0 otherwise.
4. Submit the signature to the intent's confirm endpoint. Until finalization the
   endpoint returns `409` and can be retried.

The server checks actual transaction success, signer, program, account order,
amount, signed reference and expiry against its configured RPC. A signature
cannot settle two intents. Repeating confirmation with the same signature returns
the existing result. A pending intent from another cluster is rejected.

An intent lasts 15 minutes. Settlement must occur by `expiresAt`; confirmation can
happen later. A pending record past expiry remains `pending` for that late
confirmation case. The estimated Solana block time can lag the backend clock;
the unique memo, rather than a creation-time lower bound, prevents old-payment replay.

## Errors

Errors use `{error,details?}`. Validation details contain Zod issues. Passwords,
raw request bodies and stack traces are not logged or returned to clients.

| Status | Meaning |
| --- | --- |
| 400 | Invalid address, amount, signature or JSON syntax |
| 401 | Missing/expired/revoked session or invalid wallet proof |
| 403 | Wallet or campaign belongs to another account |
| 404 | Resource not found or unavailable to current account |
| 409 | Duplicate email/wallet, transaction not finalized, network mismatch or reused payment signature |
| 413 | JSON body exceeds the 256kb request limit |
| 422 | Body validation failed or transaction does not match the intent |
| 429 | Attempt limit; see `Retry-After` |
| 500 | Internal error |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | `http://localhost:3000` | Actual frontend origin printed in signature challenges |
| `SESSION_TTL_SECONDS` | `86400` | Session lifetime, minimum 60 seconds |
| `WALLET_CHALLENGE_TTL_SECONDS` | `300` | Proof lifetime, clamped to 30-600 seconds |
| `AUTH_ATTEMPTS_PER_MINUTE` | `20` | Combined per-IP registration/login/challenge limit |

`CLUSTER`, `SOLANA_RPC_URL` and the frontend network must match. Use a separate
`DB_PATH` for each network. The Express app does not trust forwarded IP headers by
default; configure trusted proxy addresses when deployed behind a proxy. Use
HTTPS for session transport outside local development.

## Target account flow (not implemented)

- A connected wallet signs a short-lived, single-use challenge. The backend
  creates an account on first successful proof or resumes the existing one;
  email and password are optional and are not a prerequisite for backing a
  startup. Ownership proof authenticates the wallet; it is not identity or
  startup verification.
- A creator may attach organization name and contact/presentation details to
  the account. No identity review, approval status, or platform signature is
  required to create a campaign on-chain or appear as a creator. Bot protection
  can be addressed later without introducing an MVP verification gate.
- "My contributions" is based on indexed on-chain donor ledgers for every
  linked wallet and shows current stake, cancellation/refund eligibility,
  individual refund claims, campaign stage, and relevant transaction links.
  API payment intents are supplementary records only; a direct wallet pledge
  must still appear. Large wallet histories require pagination and an indexer
  freshness indicator.
- Failure of the fundraising goal returns 100% of each backer's pledge with no
  1% platform fee. The user submits an individual refund transaction; the API
  cannot promise an automatic transfer. The program and API must also support
  pledge cancellation during fundraising under the agreed lifecycle rules.
- Creator deposit accounting is separate: 0.1 SOL locked at campaign creation,
  with return/forfeit conditions and release time enforced by the program. The
  1% fee applies once to all funds raised only when the goal is met; overfunding
  is allowed. Network fees and rent are distinct costs, not deductions from a
  backer's failed-campaign refund.
- Reward entitlement and fulfilment (codes, shipping details, notifications)
  can be implemented server-side after the escrow, wallet, and contribution
  flows work. Do not store private delivery data on-chain.
