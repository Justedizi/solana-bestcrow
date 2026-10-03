# Accounts API

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

Payment handling means a SOL pledge to a Charity Vault campaign. `amount` must be
a positive `u64` decimal string; `100000000` means 0.1 SOL.

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
