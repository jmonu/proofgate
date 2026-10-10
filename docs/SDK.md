# Ordinary HTML integration

ProofGate uses a redirect authorization-code flow. A button is simple; the security protocol lives in your website’s backend. Never embed client secrets, a trusted `verified` field, or code-exchange credentials in browser JavaScript.

## Registered clients

`npm run db:seed` registers three explicit clients in PostgreSQL. It hashes their generated `.env` client secrets with SHA-256 (appropriate for random 256-bit secrets), and records the exact site name, origin, redirect URI, and allowlisted claims.

| Client ID      | Callback                         | Only permitted claim                     |
| -------------- | -------------------------------- | ---------------------------------------- |
| `demo-age`     | `http://localhost:4101/callback` | `[{type:"age_over",value:18}]`           |
| `demo-email`   | `http://localhost:4102/callback` | `[{type:"email_disclosure"}]`            |
| `demo-student` | `http://localhost:4103/callback` | `[{type:"qualification",value:"btech"}]` |

Client registration is an operator-controlled seed/administration operation, not a public browser endpoint. To add a client, extend the seed’s allowlist with an explicitly reviewed callback and supported claim, generate an independent secret, and implement the same server adapter on that website. Do not accept dynamic callback/claim values supplied by an untrusted browser.

## Browser

```html
<script src="http://localhost:4000/proofgate.js"></script>
<button id="login">Continue with ProofGate</button>
<p id="status" role="status"></p>
<script>
  document.getElementById("login").addEventListener("click", async () => {
    try {
      await ProofGate.authorize({ claims: [{ type: "age_over", value: 18 }] });
    } catch (error) {
      document.getElementById("status").textContent = error.message;
    }
  });
  // After the gateway redirects back and your server exchanges the code:
  ProofGate.session().then((result) => {
    if (result?.verified && result.claim.type === "age_over") {
      document.getElementById("status").textContent =
        "Age requirement verified";
    }
  });
</script>
```

Use a suitable CSP nonce or external script file for the inline example in production. The shipped HTML demos use external scripts and a restrictive CSP. They serve the identical SDK from their own origin; the gateway also exposes `/proofgate.js` for external embedding.

`authorize()` intentionally navigates the page. It does **not** return a trusted result in the same JavaScript continuation. `session()` reads your website’s backend after callback completion. This is the valid redirect alternative to the illustrative promise-based popup API in the project brief. Popup mode and persistent consent grants are not implemented.

## Website server contract

Implement these same-origin endpoints, as demonstrated in `demo-sites/server.ts`:

1. **POST `/auth/start`**: require exact website Origin. Compare claims with your server allowlist. Generate 256-bit random state, S256 PKCE verifier and browser transaction token. Keep state/verifier server-side. Set an HTTP-only, SameSite=Lax transaction cookie. Authenticate server-to-server to `POST /api/gateway/requests`; return its authorization URL.
2. **GET `/callback`**: read and consume the browser transaction, compare state in constant time, check expiry. Handle `access_denied`. Authenticate to `POST /api/gateway/token` with the code, fixed redirect URI and original PKCE verifier. Require the expected audience, verified result and future expiry. Establish your own random HTTP-only website session; store the gateway authorization ID server-side. Redirect to a clean `/` URL so the code is no longer in the address bar.
3. **GET `/session`**: authenticate your own cookie; call `GET /api/gateway/results/:id` with your confidential client credentials. The gateway rechecks credential revocation, expiry and wallet disconnect status. Return only the minimal verified result. Enforce this same check on protected **server** routes, not only on a UI button.
4. **POST `/logout`**: require exact website Origin, delete your own server session and clear the cookie.

The local adapters retain pending transactions and sessions in memory with cleanup. A restart signs users out of those demo websites. Persistent/high-availability websites need a protected shared session store. Gateway wallet sessions and authorization requests are stored in PostgreSQL.

## What can be trusted

`verified` is meaningful only because it came from an authenticated server-to-server code exchange/status request and was validated for that exact client. Never trust a Boolean returned by an arbitrary page, URL fragment, decoded JWT, or wallet frontend. No JWT is needed for this protocol.

The `trust: "demo-test-only"` field is mandatory context for interpreting the result. A mathematically valid proof of a demo issuer’s assertion is still a demo assertion. Email ownership status is distinct from credential signature validity; `unverified-demo` must never be treated as proof of mailbox ownership.

No site receives an entire profile or uploaded certificate. The `subject` is a website-specific account identifier. Email is revealed only by the email-disclosure claim explicitly approved by the user. Do not add tracking/analytics to the wallet or log authorization codes, claims containing emails, or raw results.
