(function (global) {
  "use strict";
  global.ProofGate = Object.freeze({
    async authorize(options) {
      // Same-origin website backend owns the client secret, PKCE and code exchange.
      const response = await fetch("/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ claims: options.claims }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Authorization could not start.");
      const url = new URL(data.authorizationUrl);
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("Invalid gateway URL.");
      global.location.assign(url.href);
      // Redirect protocol: obtain the result with ProofGate.session() after return.
    },
    async session() {
      const response = await fetch("/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 401) return null;
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not validate session.");
      return data;
    },
  });
})(window);
