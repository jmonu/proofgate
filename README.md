# ProofGate

**Zero-Knowledge Digital Identity Wallet & Verification Gateway** — a working Windows-friendly hackathon application with real Groth16 age proofs, an encrypted document vault, explicit consent, and three independent HTML demo websites.

> **Test issuer, real cryptography.** Demo credentials are not government, university, or legally authoritative verification. The server can decrypt wallet data. This is not an end-to-end encrypted or production-certified identity system.

## Quick start · Windows 11 · no Docker

Prerequisites: Node.js **22.12+**, npm, and your existing PostgreSQL installation. The wallet uses port **5174** because port 5173 was already occupied on this workstation. Gateway: 4000. Demo websites: 4101–4103. Use `localhost` consistently in the browser.

From this project directory in PowerShell or Command Prompt:

```powershell
npm.cmd install
npm.cmd run configure
```

Edit `.env` locally. Set the PostgreSQL connection string; URL-encode reserved characters in the password:

```dotenv
DATABASE_URL=postgresql://YOUR_USER:YOUR_URL_ENCODED_PASSWORD@localhost:5432/proofgate?schema=public
```

`configure` generates independent cryptographically random encryption keys, issuer keys, pairwise-identifier keys, and website client secrets. It never overwrites an existing `.env`. No passwords or credentials are committed. Keep `.env` out of source control and backups shared with others.

```powershell
npm.cmd run db:init
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run crypto:build
npm.cmd run doctor
npm.cmd run dev
```

Or run `start.cmd` after completing initialization. It checks configuration, PostgreSQL connectivity, migrations, registered clients, and proof artifacts; it stops if a required dependency fails. `db:init` creates only the named database if absent and requires `CREATE DATABASE` permission. If your administrator already created it, skip that command. No existing tables or databases are dropped.

Open **[ProofGate wallet](http://localhost:5174)**. Register your own account; no default accounts/passwords are seeded.

| Service           | Address                      | Behavior                                           |
| ----------------- | ---------------------------- | -------------------------------------------------- |
| Wallet            | http://localhost:5174        | Identity, documents, credentials, consent, history |
| Gateway           | http://localhost:4000/health | API, issuer registry, proof verification           |
| Afterhours        | http://localhost:4101        | Real 18+ ZK proof                                  |
| Letterbox         | http://localhost:4102        | Explicit email disclosure + ownership status       |
| Campus Collective | http://localhost:4103        | Signed B.Tech demo credential possession           |

Individual processes, when needed:

```powershell
npm.cmd run dev:backend
npm.cmd run dev:frontend
npm.cmd run dev:demos
```

These are development servers, bound to loopback. Production requires a reviewed deployment, HTTPS reverse proxy, hardened frontend hosting, distributed rate limiting if scaled, external issuer verification and a proper setup ceremony. See [security architecture](docs/SECURITY.md).

## Demo in five minutes

1. Register with a test email and a password of at least 12 characters.
2. Open **My Identity**, enter a valid adult date of birth and test profile, then save.
3. Upload PDF/PNG/JPEG test files into the three document categories. Preview/download requires your wallet session.
4. Open **Credentials**. Request an age test credential, re-enter the saved DOB, and acknowledge the demo review. Request email and B.Tech test credentials too; B.Tech requires an uploaded source document.
5. Open **Connected Websites → Afterhours**. Continue with ProofGate, review the claim, approve, and return. The receipt shows `age_over`, `minimumAge: 18`, and `satisfied: true` without DOB or exact age.
6. Try Letterbox and Campus Collective. Each tells you precisely what it receives. Decline a fresh request to demonstrate refusal.
7. Revoke a credential or disconnect a website, then refresh its receipt. Active demo sessions are invalidated by gateway status checks.

Full walkthrough and failure demonstrations: [HACKATHON.md](docs/HACKATHON.md).

## What is cryptographically supported

| Flow     | Actual implementation                                                                    | What the website receives                                            |
| -------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Age ≥ 18 | Circom 2.2.3 + snarkjs Groth16, issuer commitment and live status checks                 | Threshold satisfied, method, demo trust, website-specific identifier |
| Email    | Signed demo credential, explicit disclosure; SMTP OTP optionally verifies mailbox access | Approved email and `smtp-verified` or `unverified-demo`              |
| B.Tech   | Signature, authenticated holder association, expiry/revocation checks                    | B.Tech test qualification; no certificate file                       |

Email and education **are not ZK circuits**. Name matching is not implemented. B.Tech possession does not establish current enrollment. Issuance is explicitly a self-reviewed demo process, not document authenticity verification. Credential format is a documented signed application format, not a claim of W3C VC conformance.

The age circuit checks a Poseidon commitment to private `(YYYYMMDD, random salt)` and checks `DOB + minimumAge × 10000 ≤ asOf`. The issuer validates calendar dates first. Both UI and circuit treat Feb 29 anniversaries as March 1 in non-leap years. Requests use server UTC dates and expire in five minutes. A request created before midnight proves eligibility as of that request’s recorded date.

Every proof binds to a digest of request ID, nonce, audience, exact claims, redirect URI, expiry, and date. The verifier independently checks public inputs against that request, the issuer-signed commitment against the registry, and current status. A transaction consumes each authorization code once.

The gateway generates proofs on behalf of the authenticated wallet; it therefore knows private inputs. The privacy benefit here is selective disclosure **to websites**. Full details: [CRYPTOGRAPHY.md](docs/CRYPTOGRAPHY.md).

## Circuit compilation and setup

```powershell
npm.cmd run crypto:build
```

This downloads an official, version- and SHA-256-pinned Circom executable into ignored `private/tools`, compiles the circuit, creates a local power-12 Powers of Tau ceremony, contributes fresh entropy to both phases, verifies the setup, and exports proving/verification artifacts into ignored `cryptography/build`.

The ceremony is **single-machine, demonstration-only**. It provides functioning proofs but is not a secure multiparty production ceremony. Never reuse these parameters for real identity claims. Rebuilding replaces the verifier parameters and invalidates outstanding proofs; restart services after a rebuild.

## Tests and builds

The test suite refuses an integration database whose name does not end in `_test`. Tests never truncate your application database. On Windows, an optional packaged PostgreSQL binary can create an isolated test cluster on **55432**, with fresh test-only credentials, without Docker or a Windows service:

```powershell
npm.cmd run test:db
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run test:db:stop
```

The test cluster, encrypted files, and credentials are ignored (`private/`, `.env.test.local`). Your `.env` and port 5432 are untouched. On other platforms, configure your own PostgreSQL database ending in `_test` in `.env.test.local`, migrate/seed it, then run the same tests. The Windows browser test uses the installed Microsoft Edge. No test recordings containing raw private values are enabled. Screenshot artifacts contain synthetic test data only.

Tests cover calendar boundaries, real proof generation/verification, altered public inputs, invalid curve points, commitment forgery, AES-GCM tampering and owner context, Ed25519 tampering, pairwise identifiers, registration/login, CSRF/origin controls, document IDOR, MIME/signature checks, demo issuance, client allowlists, PKCE, code races, expiry, decline, revocation, disconnect, minimal responses, and the actual browser journeys.

## Email and malware scanning

- Without SMTP, the UI says **development mode / ownership unverified**. No fake OTP endpoint verifies addresses, and OTPs are never returned in an API response or log.
- Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optional `SMTP_USER`/`SMTP_PASS` to send OTPs. STARTTLS is required on the default port; port 465 uses TLS directly. Security Settings sends/validates six-digit, ten-minute codes with attempt limits. Reissue the email credential after verification.
- Configure `CLAMSCAN_PATH` to a ClamAV `clamscan` executable. Uploads fail closed on scanner rejection or error. Development without a scanner shows **not scanned**; production startup requires a scanner. The scanner temporarily reads an owner-controlled private scratch file which is deleted after scanning. Never use real documents for this hackathon environment.

## Repository map

```text
frontend/       React, TypeScript, Vite, Tailwind, React Router
backend/src/    Express routes, validation, auth, crypto wrappers
cryptography/   Circom circuit and Groth16 prover/verifier
database/       Prisma schema and committed PostgreSQL migrations
sdk/            Ordinary HTML website redirect SDK
demo-sites/     Three HTML sites and their confidential server adapters
scripts/        Windows-compatible setup, startup, cleanup, test database
tests/          Vitest, Supertest, Playwright
docs/           Architecture, protocol/API, demo, limitations
```

Integrate a website using [SDK.md](docs/SDK.md), and inspect all endpoints in [API.md](docs/API.md).

## Operations and troubleshooting

- **Database unreachable:** start your installed PostgreSQL server and verify `.env`, username, password, database name, and port. `npm run doctor` prints actionable errors without printing credentials.
- **Proof artifacts missing:** run `npm run crypto:build`; installation/build requires network access to npm and the official GitHub compiler release.
- **Port occupied:** stop only your own service or change the configured wallet origin and Vite port together. Demo origin/redirect changes also require updating client registration with `db:seed` and demo server configuration.
- **Request expired:** start again from the demo website; requests last five minutes, codes one minute, and website sessions never outlive their authorization request.
- **Credential unavailable:** issue the relevant demo credential; profile edits revoke age credentials, document replacement/deletion revokes derived education credentials.
- **Retention:** the running gateway removes expired sessions, OTPs and authorization rows, and audit records older than 30 days. `npm run cleanup` also runs that maintenance manually. No proofs or witnesses are persisted by the application.
- **Key rotation:** losing/changing `DATA_KEY` makes existing encrypted data unreadable. Changing the issuer key invalidates old credentials. This demo does not implement managed rotation or backup recovery. Keep keys separate from encrypted document storage and restrict filesystem access.

This repository has not received an independent security or cryptographic audit. Deployment limitations and dependency-audit notes are documented in [SECURITY.md](docs/SECURITY.md).
