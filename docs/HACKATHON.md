# Hackathon walkthrough

## Before presenting

Run the README setup against the local `proofgate` database. Run `npm run doctor`, then `start.cmd`. Use synthetic information and sample documents. Confirm ports 4000, 5174, 4101, 4102, 4103 are free. Internet is needed for initial installation/compiler download, not for normal local age/student proofs. SMTP is optional and email remains explicitly unverified without it.

Keep the wallet and three demo sites in tabs. Do not show `.env`, private database files or server-side credential secrets on screen. There is no need to expose any private input to explain the circuit.

## Suggested six-minute presentation

**1. Create the wallet.** Register an email with a 12+ character password. Explain that the password is Argon2id-hashed, and the session cookie is HTTP-only. The dashboard is real data from PostgreSQL, initially empty.

**2. Add a test identity.** Enter an adult DOB and show the automatically calculated age. Point out the **Self-entered** label. A form does not authenticate a birthday. Saving/changing the profile revokes previously issued age credentials.

**3. Use the vault.** Upload PDF or image samples into 10th, Intermediate and B.Tech. Preview or download from the authenticated wallet. Show **Not issued** and the explicit scanner status. A file upload does not prove authenticity. Files are AES-GCM encrypted on disk, but the server can decrypt them.

**4. Demo issuance.** Request an age credential; review/re-enter the DOB and check the demo acknowledgments. Issue email and qualification credentials. Explain that the issuer signs a salted DOB commitment, not a publicly readable DOB. Its issuer identity and Ed25519 public key are available through the API. These are test credentials, not government/university credentials.

**5. Age demo.** Open Afterhours, click **Continue with ProofGate**, and show the consent screen. Approve. The server generates a real Groth16 proof and independently verifies it against this exact request. After callback/state/PKCE/code checks, the site shows **Age requirement verified**. Expand the received JSON: there is no DOB, exact age, name, phone or file. A per-website pseudonym is present because the website establishes an account/session.

**6. Two selective-disclosure alternatives.** Letterbox explicitly asks for an email. Without SMTP, its result says **ownership unverified**; this is not a fake email proof. Campus Collective receives only a signed B.Tech test claim. It does not receive the source document and does not prove current enrollment.

**7. User control.** Start another website request and decline. Show the history entry. Revoke a credential or disconnect a website, then refresh its session; gateway status verification rejects it. Explain that revocation does not erase previously disclosed information.

## Useful failure demonstrations

- Enter an impossible date or a future DOB: validation rejects it.
- Use an under-18 identity, issue its demo credential, and attempt Afterhours: eligibility fails. No success receipt appears.
- Rename an executable/text file `.pdf`: signature validation rejects it.
- Attempt a second wallet’s document URL: authenticated ownership checks return 404.
- Tamper with a proof or request hash: automated tests show rejection.
- Reuse an authorization code: exchange fails. Race two exchanges: only one succeeds.
- Change the allowed callback or request an unregistered claim: request creation fails.
- Wait five minutes before approving: the request expires and must be restarted.
- Replace the B.Tech source file: the previously issued education credential is revoked.

## Explain the cryptography without overstating it

“The circuit proves that a private birth date and random secret match the issuer’s commitment, and that the birthday threshold is satisfied. The public proof is tied to a fresh nonce, the intended website, this claim, and an expiry. The gateway also checks the issuer’s signature and current credential status. It sends only the approved result to the website.”

Then state the limits: demo issuer assertions, one-party development trusted setup, server-side prover that can read private wallet data, and email/education signature-based disclosure rather than extra ZK circuits. No production or government trust claim is made.

## Reproducible evidence

```powershell
npm.cmd run test:db
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

The isolated PostgreSQL cluster uses port 55432, not your demo database. Tests create synthetic accounts and verify actual proofs and actual browser redirects. The test issuer is never mocked into returning success. Unit tests intentionally generate invalid witnesses/proofs and confirm failure.

The browser test creates desktop/mobile screenshots under ignored `test-results/`. Browser traces and video recording are disabled. Stop the test database after use with `npm run test:db:stop`.
