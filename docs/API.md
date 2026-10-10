# REST API

Gateway base: `http://localhost:4000`. Wallet browser uses Vite’s `/api` proxy. All JSON responses use `Cache-Control: no-store`. Failures use `{ "error": "message" }`, with optional sanitized validation `fields`. Authenticated wallet APIs require `pg_session`; non-GET requests additionally require exact `Origin: http://localhost:5174` and `X-CSRF-Token` from session status.

## Authentication

| Method | Path                         | Input / behavior                                                    |
| ------ | ---------------------------- | ------------------------------------------------------------------- |
| POST   | `/api/auth/register`         | `{email,password,confirmation,consent:true}`; sets session cookie   |
| POST   | `/api/auth/login`            | `{email,password}`; sets fresh session                              |
| GET    | `/api/auth/session`          | Account email, email status, CSRF token, session expiry, email mode |
| POST   | `/api/auth/logout`           | Deletes current session                                             |
| POST   | `/api/auth/logout-all`       | Deletes all wallet sessions                                         |
| POST   | `/api/auth/email-otp`        | Sends SMTP code, or 503 with clear unconfigured message             |
| POST   | `/api/auth/email-otp/verify` | `{otp:"123456"}`; actual one-use mailbox verification               |

Passwords are never returned. OTPs are never returned or logged. Register/login also require wallet Origin, but not a preexisting CSRF token. Account email is immutable in this small implementation.

## Wallet

| Method | Path                              | Input / behavior                                                       |
| ------ | --------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/api/wallet/summary`             | Completion, document/credential/proof counts, redacted recent activity |
| GET    | `/api/wallet/identity`            | Own profile, calculated age, `self-entered` trust                      |
| PUT    | `/api/wallet/identity`            | Validated full profile; creates/updates; revokes old age credentials   |
| GET    | `/api/wallet/age`                 | Calculated age from saved DOB                                          |
| GET    | `/api/wallet/documents`           | Own document metadata; scan and credential-issued status               |
| POST   | `/api/wallet/documents/:category` | Multipart field `file`; upload/replace one source document             |
| GET    | `/api/wallet/documents/:id/file`  | Authenticated private preview; `?download=1` downloads                 |
| DELETE | `/api/wallet/documents/:id`       | Delete and revoke linked credentials                                   |
| GET    | `/api/wallet/history`             | Up to 100 redacted events, newest first                                |
| GET    | `/api/wallet/connections`         | Active website connections                                             |
| DELETE | `/api/wallet/connections/:id`     | Disconnect; invalidate pending codes and active website status         |

Profile: `firstName`, optional `middleName`, `lastName`, `dob` (`YYYY-MM-DD`), optional `gender`, account `email`, `phone`. Dates are server validated. Gender options: empty, `female`, `male`, `nonbinary`, `prefer-not-to-say`. Categories: `tenth`, `intermediate`, `btech`.

Document IDs are unguessable but authorization never relies on obscurity: every lookup also checks `userId`. Other users receive 404. Files are never served statically.

## Credentials

| Method | Path                          | Behavior                                                    |
| ------ | ----------------------------- | ----------------------------------------------------------- |
| GET    | `/api/credentials/issuer`     | Public demo issuer identity and Ed25519 public key          |
| GET    | `/api/credentials/status/:id` | Public status only: active, expired/revoked, expiry         |
| GET    | `/api/credentials`            | Own credential metadata, not DOB/salt/private payload       |
| POST   | `/api/credentials/issue`      | `{type,reviewed:true,understandDemo:true,dobConfirmation?}` |
| POST   | `/api/credentials/:id/revoke` | Revoke own test credential                                  |

Types: `age`, `email`, `qualification`. Age issuance requires DOB confirmation matching the saved profile. Qualification requires a B.Tech upload. All issued credentials are signed and labeled `demo-test-only`, valid for 30 days. Reissuing a type revokes previous credentials of that type.

## Gateway protocol

Server-to-server routes require HTTP Basic authentication using registered `clientId:clientSecret`. Secrets are high-entropy values generated locally and never embedded in HTML.

### Create request

`POST /api/gateway/requests`

```json
{
  "claims": [{ "type": "age_over", "value": 18 }],
  "redirectUri": "http://localhost:4101/callback",
  "state": "43-character-cryptographic-random-base64url-value",
  "codeChallenge": "43-character-base64url-SHA256-of-PKCE-verifier"
}
```

The placeholders describe required values; clients must generate real random state/verifiers. Response: `id`, `authorizationUrl`, `expiresAt`. The gateway generates the nonce and records the current UTC date. Exact registered claims and callback must match. Request lifetime: five minutes.

### Review / decide (wallet session)

- `GET /api/gateway/requests/:id` — displays site/claim/expiry and binds the pending request to the authenticated wallet. Another wallet cannot approve it.
- `POST /api/gateway/requests/:id/approve` — `{approved:true}` generates and verifies a real age proof, or validates an explicitly disclosed signed claim. Optional `{proof,publicSignals}` permits submitting a separately generated age proof for independent verification. Returns only a validated `redirectUrl` containing a one-use code and state.
- `POST /api/gateway/requests/:id/reject` — marks rejected and returns the registered callback with `error=access_denied` and state.
- `POST /api/gateway/requests/:id/proof` — `{approved:true}` generates an age proof after review; returns proof/public signals/credential ID only to the wallet. Does not issue an authorization code.
- `POST /api/gateway/requests/:id/verify` — `{proof,publicSignals}` independently checks an age proof for that wallet/request. Does not authorize a website or consume a code.

All these POSTs require wallet Origin and CSRF. The application retains proofs only in memory. Standalone verification is not a substitute for the full authorization transaction.

### Exchange (website server only)

`POST /api/gateway/token`

```json
{
  "code": "random-code-from-registered-callback",
  "redirectUri": "http://localhost:4101/callback",
  "codeVerifier": "original-random-PKCE-verifier"
}
```

Checks exact client/audience/redirect, S256 PKCE, request/code expiry, current credential and connection status, and single use. Codes expire in 60 seconds. A serializable transaction prevents concurrent successful exchanges. Example minimal result:

```json
{
  "authorizationId": "opaque-request-id",
  "audience": "demo-age",
  "expiresAt": "ISO timestamp",
  "verified": true,
  "subject": "website-specific-pseudonymous-identifier",
  "trust": "demo-test-only",
  "claim": { "type": "age_over", "minimumAge": 18, "satisfied": true },
  "method": "groth16"
}
```

Email result: `claim: {type:"email_disclosure",email,emailOwnership}`, `method:"explicit-disclosure"`. Qualification result: `claim:{type:"qualification",value:"btech"}`, `method:"signed-credential"`. No source document, DOB, exact age, name, phone, raw credential, proof, or commitment is sent to a demo site.

`GET /api/gateway/results/:id` — authenticated exact client can retrieve a previously exchanged minimal result while the request, credential, and connection remain valid. Demo website sessions call it on each status load; their own HTTP-only cookies are not assertions the gateway blindly trusts.

## Public artifacts

- `GET /health` — succeeds only when database and proof artifacts are available.
- `GET /proofgate.js` — browser SDK.
- `GET /.well-known/proofgate` — public metadata paths.
- `GET /artifacts/verification_key.json` — verification parameters.
- `GET /artifacts/age.circom` — circuit source.

Typical status codes: 400 validation/proof/code failure; 401 session/client failure; 403 CSRF/origin/ownership binding failure; 404 unavailable resource; 409 concurrency conflict; 410 consumed/expired request; 413 oversized JSON; 422 scanner rejection; 429 throttling; 503 unconfigured SMTP. Retry a concurrency conflict by starting a fresh authorization request if the original has already been consumed.
