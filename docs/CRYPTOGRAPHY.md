# Cryptographic design

## Trust statement

ProofGate uses genuine Groth16 over BN254, through [snarkjs](https://github.com/iden3/snarkjs), [Circom](https://github.com/iden3/circom), and [circomlib](https://github.com/iden3/circomlib). The circuit is application code and has not been independently audited. Credential authenticity depends on a separate trusted issuer check; a comparison circuit by itself does not authenticate a birthday.

## Credential commitment

The demo issuer validates a Gregorian date between 1900-01-01 and the current UTC date. It samples a 248-bit salt with Node’s cryptographic RNG and computes:

```text
commitment = Poseidon(YYYYMMDD, salt)
```

It signs the exact serialized credential payload with Ed25519. Payload fields include random credential ID, issuer, random subject handle, type, issuance/expiry, demo trust, status endpoint, and commitment. DOB and salt are separately encrypted with AES-256-GCM, authenticated to the credential ID. Credential rows associate that subject with the authenticated wallet. This is a centralized credential registry rather than a transferable holder-key or decentralized VC implementation.

Issuance deliberately does not verify a passport or government record. It verifies that the user reviewed and confirmed the stored test DOB; UI and API label the result `demo-test-only`. A production issuer must replace this review with appropriate authoritative evidence and governance.

## Circuit

Private inputs: `dob` (YYYYMMDD integer) and `salt`.

Public inputs, in exact order after the output: `commitment`, `minimumAge`, `asOf`, `requestHash`.

Public output: `requestBinding = Poseidon(salt, requestHash)`.

Constraints:

1. `dob` and `asOf` fit in 27 bits; `minimumAge` fits in seven bits.
2. `Poseidon(dob, salt) == commitment`.
3. `dob + minimumAge * 10000 <= asOf` using a 28-bit comparator.
4. The request-binding output constrains `requestHash` to the private witness, preventing it from becoming an unused public signal.

The intermediate maximum is below 2^28, so arithmetic cannot exploit field wraparound. The verifier only accepts canonical nonnegative decimal field elements, checks signal count and values, and invokes Groth16 verification. The gateway currently allowlists only threshold 18. General seven-bit circuit inputs do not authorize arbitrary website thresholds.

The circuit relies on issuer-side calendar validation of the committed DOB. It does not separately prove the private value is a Gregorian date. An attacker cannot substitute an earlier DOB without finding a Poseidon second preimage or forging a valid proof/issuer commitment. A malicious or compromised trusted issuer can issue false claims; the proof does not fix issuer dishonesty.

## Date semantics

YYYYMMDD numeric order equals calendar order for valid dates. Adding N × 10000 preserves month/day, expressing the Nth birthday. For February 29 in a non-leap year, the comparison is false on February 28 and true on March 1. The dashboard uses the same rule. This is a documented demo policy, not a claim that every jurisdiction uses the same legal birthday rule.

The server records UTC `asOf` when it creates a request. It cannot be selected by the website/browser. Requests expire after five minutes; near midnight, the proof still refers to that recorded date. No date or age is accepted from a frontend `verified` Boolean.

## Request binding and replay

```text
context = {
  domain: "ProofGate:age:v1",
  requestId, nonce, audience, redirectUri,
  claims, expiresAt, asOf
}
requestHash = SHA256(JSON.stringify(context)) mod BN254_scalar_field
```

Both sides construct the object in a fixed field order from the persisted, immutable request. Claims are validated and canonically serialized at request creation. The proof’s public request hash must match. Changing audience, nonce, claim, expiry, or request ID fails either public-input matching or Groth16 verification. Credential ID is not a website-visible identifier.

Proof verification alone is not a consumed authorization. After explicit consent and successful verification, a serializable transaction rechecks credential status and request expiry, transitions the request from pending to approved, stores a hash of a new random code, and records redacted audit metadata. Token exchange authenticates the exact client and PKCE verifier, rechecks status, then atomically consumes the code. A repeated proof cannot authorize a different request; the same request cannot issue multiple codes. A repeated code cannot create another session.

Revocation/expiry are live database checks, **not in-circuit accumulators**. The signing key and registry are part of the verifier’s trust boundary. A standalone Groth16 `true` without those checks is insufficient evidence of an issued active credential.

## Setup and artifacts

`npm run crypto:build` uses the SHA-256-pinned official x64 Circom 2.2.3 executable. The npm WASI wrapper was incompatible with this Windows environment; the native compiler is the automated alternative. Setup uses power 12 (4096-capacity), followed by fresh local contributions in both phases and verification of the Powers of Tau transcript and final proving key.

- `age.r1cs`: constraint system
- `age_js/age.wasm`: witness calculator
- `age_final.zkey`: proving parameters
- `verification_key.json`: independent verification parameters
- `manifest.json`: circuit digest and demo setup label

At the time of local testing, compilation reported 576 nonlinear and 556 linear constraints, four public inputs, two private inputs, and one output. Artifacts are ignored and regenerated, rather than committing megabytes of binary parameters.

This is a **single-party test setup**. The machine creates and contributes the trapdoor material. Random entropy is not written to the repository or command-line arguments, but secure memory erasure and trustworthy ceremony participation are not guaranteed. Production needs a reviewed multiparty ceremony (at least one honest contributor), transcript verification, pinned artifact integrity, and an audited circuit. Do not represent the local ceremony as production-secure.

## Privacy boundaries and unsupported features

The gateway is both custodian/prover and verifier in this demo. It can decrypt DOB, salt, and source documents. The verifier checks the proof mathematically independently; it is not an independently operated organization. The browser never receives DOB/salt as proof inputs; it receives profile data only on the authenticated identity screen. Private proof inputs and full credential payloads are never sent to websites or audit logs.

Websites receive a per-website HMAC identifier. The same website can recognize repeated logins; different websites cannot directly compare that identifier. The gateway can correlate all wallet activity. Stable commitments remain internal to ProofGate and are not claimed to provide unlinkability from the gateway.

Email is explicit disclosure of a signed credential claim, and education is selective disclosure after signature/holder/status checks. Neither is a zero-knowledge circuit. Proofs of current enrollment, name equality, decentralized revocation, mobile key custody, and cryptographic holder keys are not implemented.
