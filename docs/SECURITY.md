# Security architecture and limitations

## Threat and trust boundaries

The demo protects one wallet’s data from other wallets and prevents registered websites from silently receiving unrelated attributes. The gateway, database administrator, filesystem administrator, and demo issuer remain trusted. The server possesses the AES key and Ed25519 issuer private key. A compromised server can decrypt data and issue false demo credentials. This is server-side encryption at rest, not end-to-end encryption.

The local transport is loopback HTTP for demonstration. Cookie `Secure` is enabled in production mode; production configuration refuses HTTP origins and missing malware scanning. Production still requires TLS termination and security review. Do not put real identity records into this development environment.

## Data separation

| Data                               | Storage                                                                    | Access                                       |
| ---------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| Password                           | Argon2id hash, 64 MiB, three iterations, one lane                          | Auth verifier only                           |
| Account email                      | AES-GCM encrypted; keyed HMAC lookup index                                 | Authenticated wallet/server                  |
| Profile including DOB, phone, name | AES-GCM envelope, user ID as authenticated context                         | Own wallet/server                            |
| Source file                        | AES-256-GCM ciphertext, random storage identifier, user/storage ID context | Own authenticated document routes            |
| Original filename                  | AES-GCM ciphertext                                                         | Own document metadata                        |
| Credential DOB/salt or email       | AES-GCM ciphertext, credential ID context                                  | Server prover/issuer                         |
| Issuer signature/payload           | Database; public key available separately                                  | Server validation; metadata exposed to owner |
| Session                            | SHA-256 of random cookie token, CSRF token, expiry                         | Server authentication                        |
| Authorization code                 | SHA-256 digest; single use                                                 | Authenticated client + PKCE verifier         |
| Minimal approved result            | AES-GCM ciphertext                                                         | Exact authenticated client until expiry      |
| History                            | Event, website, claim **type**, outcome, timestamps                        | Own wallet; no sensitive claim values        |

Row ownership, document category, MIME, sizes and timestamps remain database metadata. Neither full database encryption nor metadata privacy from administrators is claimed. Keep key files outside encrypted document storage, protect `.env` with local filesystem permissions, and exclude it from source control and sharing. Windows ACL hardening, encrypted backups, key rotation, and disaster recovery are deployment responsibilities.

## Authentication and request integrity

- Password length 12–128 characters. No default or fallback credentials.
- Random 256-bit sessions; database stores only token hashes. Eight-hour expiration; logout and logout-all delete sessions. Cookies are HTTP-only, SameSite=Lax, path `/api`; production adds Secure.
- Authentication routes require exact wallet Origin. Authenticated mutations additionally require the session CSRF token. Tokens are held in React memory, not localStorage/sessionStorage.
- CORS only reflects the configured wallet origin and permits credentials there. Demo websites call their own backend; confidential client secrets never reach browser JavaScript.
- Global, login/registration, client, OTP, and proof rate limits; request body limits; one proof-generation job at a time.
- Error responses avoid raw SQL, stack traces, input payloads and crypto secrets. Logs contain event categories/timestamps, not request bodies.
- SMTP OTPs are cryptographically sampled, HMAC-protected in the database, expire in ten minutes, and have five attempts plus route throttling. Without SMTP, verification fails explicitly and the UI says ownership unverified.

These controls are suitable for a single-process local demonstration. In-memory rate limits and demo website sessions require shared storage/coordination when horizontally scaled. There is no password-reset, account-deletion, MFA, or account recovery flow in this implementation; logout-all is available.

## Document protection

Uploads are capped at 8 MiB, one file, PDF/PNG/JPEG only. Declared MIME type, extension, and detected magic bytes must agree. Executables/unsupported signatures are rejected. Files use cryptographic random storage IDs and stay outside static/public directories. Every list, preview, download, replace, delete, and derived-credential operation scopes queries to the authenticated user.

AES-GCM authenticates ciphertext and its owner context. Preview responses use a sandbox CSP and explicit content type; no user-supplied filename appears in response headers. Original filenames are encrypted and rendered as text by React. Uploaded PDFs can contain active content; signature detection is not sanitization or antivirus. Production requires ClamAV; development clearly displays not-scanned status if it is absent.

ClamAV scans a temporary private plaintext file and the process removes it in a `finally` block. A process/host crash could leave that scratch file behind. OS disk encryption, ephemeral scan storage, sandboxed scanning, stale-file cleanup and content-disarm/reconstruction are recommended deployment improvements. No certificate authenticity is inferred from scanning or upload.

Replacing/deleting a source document revokes linked education credentials. Saving an identity revokes age credentials, even if a nonsensitive profile field changed. Filesystem and database changes cannot form one atomic transaction; write failures are compensated, and stale encrypted files can remain after a process crash. Production needs reconciliation and durable job handling.

## Credential and authorization integrity

The demo issuer signs exact payload bytes with Ed25519. It validates user review and source existence, not official identity/education evidence. There is no API that accepts a browser-supplied `verified: true` field. Request and approval schemas reject unknown fields.

Clients have fixed registered claims and exact redirect URLs. Request creation requires a high-entropy client secret over Basic authentication (TLS required outside localhost). Server-created nonces, five-minute requests, S256 PKCE, one-minute random authorization codes, client audience checks, and atomic consumption prevent common code injection/replay paths. Registered callback state is generated by the demo backend, bound to an HTTP-only browser cookie, and verified before code exchange.

The consent screen displays site name, origin, exact claim and demo trust. Each new request requires approval. A connection is an audit/status association, **not standing permission** to disclose new claims. Website sessions ask the gateway for current credential and connection status; revocation affects those sessions immediately at the next status check. It does not erase information already disclosed.

Groth16 setup, commitment binding, public inputs and date semantics are detailed in [CRYPTOGRAPHY.md](CRYPTOGRAPHY.md). These are not independently audited.

## Retention

Proofs and witnesses are generated in memory and not persisted. Authorization data is retained until request expiry and a cleanup pass; gateway maintenance runs at startup and hourly. Session/OTP expiry is enforced at request time even before cleanup. Redacted security history is deleted after 30 days. `npm run cleanup` performs maintenance manually. Credentials/documents remain until replaced, deleted, or otherwise managed; credential revocation changes status rather than erasing records. Node/process memory is not guaranteed to be securely wiped.

## Dependency review

After updating Nodemailer and Vitest and pinning `deepmerge-ts`, `underscore`, and `ws` fixes, the local npm audit reported **no moderate, high, or critical advisories**, with low-severity transitive advisories remaining. These are associated with circomlibjs’s unused Ethers/Elliptic dependency tree. ProofGate uses circomlibjs’s Poseidon function, not Ethers wallets or Elliptic signing; signatures use Node’s Ed25519 implementation. Do not interpret this as an independent reachability audit. Re-run `npm audit` before any deployment; advisory databases change.

## Production work still required

Authoritative issuer enrollment and evidence verification; audited circuits and ceremony; secure key management/rotation; TLS and deployment CSP; robust recovery; distributed rate limits and sessions; monitoring without PII; storage reconciliation; scanner isolation; penetration testing; availability/load testing; legal/privacy policy review; and operational retention/backup controls. No government/university trust claim should be made for the shipped demo issuer.
