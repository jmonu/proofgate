import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { resolve } from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { auth } from "./auth.js";
import { wallet } from "./wallet.js";
import { credentials } from "./credentials.js";
import { gateway } from "./gateway.js";
import { walletOrigin, HttpError } from "./middleware.js";
import { assertArtifacts } from "../../cryptography/proof.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.headers.origin === config.WALLET_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", config.WALLET_ORIGIN);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-CSRF-Token");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS",
    );
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(req.headers.origin === config.WALLET_ORIGIN ? 204 : 403);
    return;
  }
  next();
});
app.use(
  rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests." },
  }),
);
app.use(express.json({ limit: "128kb" }), cookieParser());
app.get("/health/database", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ database: "connected" });
  } catch {
    res.status(503).json({ database: "disconnected" });
  }
});
app.get("/health", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  await assertArtifacts();
  res.json({ status: "ready", issuer: "demo-test-only" });
});
app.get("/proofgate.js", (_req, res) =>
  res.sendFile(resolve("sdk/proofgate.js")),
);
app.get("/.well-known/proofgate", (_req, res) =>
  res.json({
    issuer: "/api/credentials/issuer",
    proofSystem: "Groth16 BN254",
    verificationKey: "/artifacts/verification_key.json",
    circuit: "/artifacts/age.circom",
  }),
);
app.get("/artifacts/verification_key.json", (_req, res) =>
  res.sendFile(resolve("cryptography/build/verification_key.json")),
);
app.get("/artifacts/age.circom", (_req, res) =>
  res.sendFile(resolve("cryptography/age.circom")),
);
app.use("/api/auth", walletOrigin, auth);
app.use("/api/wallet", walletOrigin, wallet);
app.use("/api/credentials", walletOrigin, credentials);
app.use("/api/gateway", gateway);
app.use((_req, res) => res.status(404).json({ error: "Endpoint not found." }));
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError) {
      res
        .status(400)
        .json({
          error: "Invalid input.",
          fields: error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof MulterError) {
      res
        .status(400)
        .json({ error: "Upload rejected. Use one file up to 8 MB." });
      return;
    }
    if (error.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid JSON." });
      return;
    }
    if (error.type === "entity.too.large") {
      res.status(413).json({ error: "Request too large." });
      return;
    }
    if (error.code === "P2002") {
      res
        .status(409)
        .json({ error: "This record already exists. Refresh and retry." });
      return;
    }
    if (error.code === "P2034") {
      res
        .status(409)
        .json({ error: "Concurrent change detected. Refresh and retry." });
      return;
    }
    // Never log request bodies, proofs, SQL parameters, credentials, or raw errors.
    console.error(
      JSON.stringify({
        event: "request.failed",
        kind: "internal",
        time: new Date().toISOString(),
      }),
    );
    res
      .status(500)
      .json({
        error:
          "Request could not be completed. Check service health and retry.",
      });
  },
);
