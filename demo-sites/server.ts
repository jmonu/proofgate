import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
const gateway = process.env.GATEWAY_ORIGIN || "http://localhost:4000";
const clients = [
  {
    id: "demo-age",
    port: 4101,
    file: "age",
    key: "DEMO_AGE_SECRET",
    claims: [{ type: "age_over", value: 18 }],
  },
  {
    id: "demo-email",
    port: 4102,
    file: "email",
    key: "DEMO_EMAIL_SECRET",
    claims: [{ type: "email_disclosure" }],
  },
  {
    id: "demo-student",
    port: 4103,
    file: "student",
    key: "DEMO_STUDENT_SECRET",
    claims: [{ type: "qualification", value: "btech" }],
  },
];
const random = () => randomBytes(32).toString("base64url");
const sha = (s: string) => createHash("sha256").update(s).digest("base64url");
const safe = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const servers: any[] = [];
for (const c of clients) {
  const secret = process.env[c.key];
  if (!secret || secret.length < 32)
    throw new Error(`Missing ${c.key}. Run npm run configure.`);
  const origin = `http://localhost:${c.port}`,
    redirectUri = origin + "/callback";
  const pending = new Map<
      string,
      { state: string; verifier: string; expires: number }
    >(),
    sessions = new Map<string, { id: string; expires: number }>();
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  const sessionCookie = "pg_" + c.id,
    stateCookie = "pg_state_" + c.id;
  const authorization =
    "Basic " + Buffer.from(c.id + ":" + secret).toString("base64");
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'", gateway],
          "style-src": ["'self'"],
          "upgrade-insecure-requests": null,
        },
      },
      crossOriginOpenerPolicy: { policy: "same-origin" },
    }),
    cookieParser(),
    express.json({ limit: "4kb" }),
    rateLimit({ windowMs: 60000, limit: 100 }),
  );
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  async function call(path: string, body?: unknown) {
    const response = await fetch(gateway + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Gateway unavailable.");
    return data;
  }
  app.get("/", (_req, res) =>
    res.sendFile(resolve(`demo-sites/${c.file}/index.html`)),
  );
  app.get("/demo.css", (_req, res) =>
    res.sendFile(resolve("demo-sites/demo.css")),
  );
  app.get("/demo.js", (_req, res) =>
    res.sendFile(resolve("demo-sites/demo.js")),
  );
  app.get("/proofgate.js", (_req, res) =>
    res.sendFile(resolve("sdk/proofgate.js")),
  );
  app.get("/config", (_req, res) => res.json({ claims: c.claims }));
  app.post("/auth/start", async (req, res) => {
    if (req.headers.origin !== origin) {
      res.status(403).json({ error: "Untrusted origin." });
      return;
    }
    if (JSON.stringify(req.body.claims) !== JSON.stringify(c.claims)) {
      res
        .status(400)
        .json({ error: "This website does not request those claims." });
      return;
    }
    const state = random(),
      verifier = random(),
      id = random();
    const data = await call("/api/gateway/requests", {
      claims: c.claims,
      redirectUri,
      state,
      codeChallenge: sha(verifier),
    });
    pending.set(sha(id), { state, verifier, expires: Date.now() + 300000 });
    res.cookie(stateCookie, id, { ...cookie, maxAge: 300000 });
    res.json(data);
  });
  app.get("/callback", async (req, res) => {
    const token = String(req.cookies[stateCookie] || ""),
      key = sha(token),
      p = pending.get(key);
    pending.delete(key);
    res.clearCookie(stateCookie, cookie);
    if (
      !p ||
      p.expires < Date.now() ||
      typeof req.query.state !== "string" ||
      !safe(p.state, req.query.state)
    ) {
      res
        .status(400)
        .send(
          "Invalid or expired login state. Return to the website and try again.",
        );
      return;
    }
    if (req.query.error) {
      res.redirect("/?denied=1");
      return;
    }
    if (typeof req.query.code !== "string") {
      res.status(400).send("Authorization code missing.");
      return;
    }
    const result = await call("/api/gateway/token", {
      code: req.query.code,
      redirectUri,
      codeVerifier: p.verifier,
    });
    if (
      result.audience !== c.id ||
      !result.verified ||
      new Date(result.expiresAt).getTime() < Date.now()
    )
      throw new Error("Invalid verification result.");
    const session = random();
    sessions.set(sha(session), {
      id: result.authorizationId,
      expires: new Date(result.expiresAt).getTime(),
    });
    res.cookie(sessionCookie, session, {
      ...cookie,
      maxAge: Math.max(0, new Date(result.expiresAt).getTime() - Date.now()),
    });
    res.redirect("/");
  });
  app.get("/session", async (req, res) => {
    const s = sessions.get(sha(String(req.cookies[sessionCookie] || "")));
    if (!s || s.expires < Date.now()) {
      res.status(401).json({ error: "No active verification session." });
      return;
    }
    try {
      const result = await call("/api/gateway/results/" + s.id);
      if (result.audience !== c.id || !result.verified) throw new Error();
      res.json(result);
    } catch {
      res.clearCookie(sessionCookie, cookie);
      res.status(401).json({ error: "Verification expired or revoked." });
    }
  });
  app.post("/logout", (req, res) => {
    if (req.headers.origin !== origin) {
      res.sendStatus(403);
      return;
    }
    sessions.delete(sha(String(req.cookies[sessionCookie] || "")));
    res.clearCookie(sessionCookie, cookie);
    res.json({ ok: true });
  });
  app.use((_err: any, _req: any, res: any, _next: any) =>
    res
      .status(502)
      .json({
        error: "Gateway request failed. Return to the website and retry.",
      }),
  );
  const timer = setInterval(() => {
    for (const [k, p] of pending) if (p.expires < Date.now()) pending.delete(k);
    for (const [k, s] of sessions)
      if (s.expires < Date.now()) sessions.delete(k);
  }, 60000);
  timer.unref();
  servers.push(
    app.listen(c.port, "127.0.0.1", () =>
      console.log(`${c.id} ready: ${origin}`),
    ),
  );
}
process.on("SIGTERM", () => {
  servers.forEach((s) => s.close());
  process.exit(0);
});
