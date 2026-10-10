import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Authorization, Client } from "@prisma/client";
import { createHash } from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";
import { random, hash, equal, unseal, seal, pairwise } from "./security.js";
import { authenticate, audit, fail, walletOrigin } from "./middleware.js";
import { claimsSchema, dateNumber } from "./validation.js";
import { activeCredential } from "./credentials.js";
import { proveAge, verifyAge, requestField } from "../../cryptography/proof.js";
export const gateway = Router();
const clientLimit = rateLimit({
  windowMs: 60000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Request limit reached." },
});
const proofLimit = rateLimit({
  windowMs: 60000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Proof limit reached. Wait a minute." },
});
async function clientAuth(req: Request): Promise<Client> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Basic "))
    fail(401, "Client authentication required.");
  const decoded = Buffer.from(header.slice(6), "base64").toString();
  const split = decoded.indexOf(":");
  const client = await db.client.findUnique({
    where: { id: decoded.slice(0, split) },
  });
  if (!client || !equal(client.secretHash, hash(decoded.slice(split + 1))))
    fail(401, "Client authentication failed.");
  return client;
}
export function contextFor(r: Authorization) {
  return {
    domain: "ProofGate:age:v1",
    requestId: r.id,
    nonce: r.nonce,
    audience: r.clientId,
    redirectUri: r.redirectUri,
    claims: JSON.parse(r.claims),
    expiresAt: r.expiresAt.toISOString(),
    asOf: r.asOf,
  };
}
async function pending(id: string, userId?: string) {
  const r = await db.authorization.findUnique({ where: { id } });
  if (!r || r.expiresAt < new Date() || r.status !== "pending")
    fail(410, "This request has expired or was already used.");
  if (r.userId && r.userId !== userId)
    fail(403, "This request belongs to another wallet.");
  return r;
}
function redirect(r: Authorization, params: Record<string, string>) {
  const url = new URL(r.redirectUri);
  Object.entries({ ...params, state: r.state }).forEach(([k, v]) =>
    url.searchParams.set(k, v),
  );
  return url.toString();
}
gateway.post("/requests", clientLimit, async (req, res) => {
  const client = await clientAuth(req);
  const data = z
    .object({
      claims: claimsSchema,
      redirectUri: z.url(),
      state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
      codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    })
    .strict()
    .parse(req.body);
  if (
    data.redirectUri !== client.redirectUri ||
    JSON.stringify(data.claims) !== client.claims
  )
    fail(400, "Claims or callback are not allowed for this client.");
  const request = await db.authorization.create({
    data: {
      clientId: client.id,
      nonce: random(),
      state: data.state,
      challenge: data.codeChallenge,
      claims: JSON.stringify(data.claims),
      redirectUri: client.redirectUri,
      asOf: dateNumber(),
      expiresAt: new Date(Date.now() + 5 * 60000),
    },
  });
  res
    .status(201)
    .json({
      id: request.id,
      authorizationUrl: `${config.WALLET_ORIGIN}/authorize/${request.id}`,
      expiresAt: request.expiresAt,
    });
});
gateway.post("/token", clientLimit, async (req, res) => {
  const client = await clientAuth(req);
  const data = z
    .object({
      code: z.string().min(40).max(100),
      redirectUri: z.url(),
      codeVerifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
    })
    .strict()
    .parse(req.body);
  const result = await db.$transaction(
    async (tx) => {
      const row = await tx.authorization.findUnique({
        where: { codeHash: hash(data.code) },
      });
      if (
        !row ||
        row.clientId !== client.id ||
        row.redirectUri !== data.redirectUri ||
        row.status !== "approved" ||
        !row.codeExpiresAt ||
        row.codeExpiresAt < new Date() ||
        row.expiresAt < new Date()
      )
        fail(400, "Invalid or expired authorization code.");
      const challenge = createHash("sha256")
        .update(data.codeVerifier)
        .digest("base64url");
      if (!equal(challenge, row.challenge))
        fail(400, "PKCE validation failed.");
      const credential = await tx.credential.findUnique({
        where: { id: row.credentialId! },
      });
      const connection = await tx.connection.findUnique({
        where: {
          userId_clientId: { userId: row.userId!, clientId: client.id },
        },
      });
      if (
        !credential ||
        credential.revokedAt ||
        credential.expiresAt < new Date() ||
        !connection ||
        connection.revokedAt
      )
        fail(400, "Credential or website permission was revoked.");
      const consumed = await tx.authorization.updateMany({
        where: { id: row.id, status: "approved" },
        data: { status: "exchanged", codeHash: null },
      });
      if (!consumed.count) fail(400, "Authorization code already used.");
      return {
        authorizationId: row.id,
        audience: client.id,
        expiresAt: row.expiresAt,
        ...unseal(row.resultCipher!, row.id),
      };
    },
    { isolationLevel: "Serializable" },
  );
  res.json(result);
});
gateway.get("/results/:id", clientLimit, async (req, res) => {
  const client = await clientAuth(req),
    r = await db.authorization.findUnique({
      where: { id: String(req.params.id) },
    });
  if (
    !r ||
    r.clientId !== client.id ||
    r.status !== "exchanged" ||
    r.expiresAt < new Date()
  )
    fail(401, "Verification session expired.");
  const [c, connection] = await Promise.all([
    db.credential.findUnique({ where: { id: r.credentialId! } }),
    db.connection.findUnique({
      where: { userId_clientId: { userId: r.userId!, clientId: client.id } },
    }),
  ]);
  if (
    !c ||
    c.revokedAt ||
    c.expiresAt < new Date() ||
    !connection ||
    connection.revokedAt
  )
    fail(401, "Verification or connection revoked.");
  res.json({
    authorizationId: r.id,
    audience: client.id,
    expiresAt: r.expiresAt,
    ...unseal(r.resultCipher!, r.id),
  });
});
gateway.use(walletOrigin, authenticate);
gateway.get("/requests/:id", async (req, res) => {
  const row = await pending(String(req.params.id), req.user.id),
    client = await db.client.findUniqueOrThrow({ where: { id: row.clientId } });
  const bound = await db.authorization.updateMany({
    where: {
      id: row.id,
      status: "pending",
      OR: [{ userId: null }, { userId: req.user.id }],
    },
    data: { userId: req.user.id },
  });
  if (!bound.count) fail(403, "Request already bound to another wallet.");
  res.json({
    id: row.id,
    website: client.name,
    origin: client.origin,
    claims: JSON.parse(row.claims),
    expiresAt: row.expiresAt,
    trust: "demo-test-only",
  });
});
let proving = false;
async function generate(r: Authorization, userId: string) {
  if (proving) fail(429, "The demo prover is busy. Try again shortly.");
  proving = true;
  try {
    const { record, payload } = await activeCredential(userId, "age"),
      secret = unseal(record.secretCipher!, record.id);
    const minimumAge = JSON.parse(r.claims)[0].value;
    if (secret.dob + minimumAge * 10000 > r.asOf)
      fail(400, "The credential does not satisfy this age requirement.");
    const expected = {
      commitment: payload.commitment,
      minimumAge,
      asOf: r.asOf,
      requestHash: requestField(contextFor(r)),
    };
    const generated = await proveAge({ ...secret, ...expected });
    return { record, expected, ...generated };
  } finally {
    proving = false;
  }
}
gateway.post("/requests/:id/proof", proofLimit, async (req, res) => {
  z.object({ approved: z.literal(true) })
    .strict()
    .parse(req.body);
  const row = await pending(String(req.params.id), req.user.id);
  if (row.userId !== req.user.id) fail(403, "Review the request first.");
  if (JSON.parse(row.claims)[0].type !== "age_over")
    fail(400, "Only age uses a ZK proof.");
  const p = await generate(row, req.user.id);
  res.json({
    proof: p.proof,
    publicSignals: p.publicSignals,
    credentialId: p.record.id,
  });
});
gateway.post("/requests/:id/verify", proofLimit, async (req, res) => {
  const row = await pending(String(req.params.id), req.user.id);
  if (row.userId !== req.user.id) fail(403, "Review the request first.");
  if (JSON.parse(row.claims)[0].type !== "age_over")
    fail(400, "Not an age request.");
  const { payload } = await activeCredential(req.user.id, "age");
  const data = z
    .object({
      proof: z.record(z.string(), z.unknown()),
      publicSignals: z.array(z.string()).length(5),
    })
    .parse(req.body);
  const verified = await verifyAge(data.proof, data.publicSignals, {
    commitment: payload.commitment,
    minimumAge: 18,
    asOf: row.asOf,
    requestHash: requestField(contextFor(row)),
  });
  if (!verified) fail(400, "Cryptographic verification failed.");
  res.json({
    verified: true,
    note: "Verification only; no authorization code issued.",
  });
});
gateway.post("/requests/:id/approve", proofLimit, async (req, res) => {
  const data = z
    .object({
      approved: z.literal(true),
      proof: z.record(z.string(), z.unknown()).optional(),
      publicSignals: z.array(z.string()).length(5).optional(),
    })
    .strict()
    .parse(req.body);
  const row = await pending(String(req.params.id), req.user.id);
  if (row.userId !== req.user.id) fail(403, "Review the request first.");
  const claim = JSON.parse(row.claims)[0];
  let credentialId: string, result: any;
  if (claim.type === "age_over") {
    let p: any;
    if (data.proof && data.publicSignals) {
      const { record, payload } = await activeCredential(req.user.id, "age");
      p = {
        record,
        proof: data.proof,
        publicSignals: data.publicSignals,
        expected: {
          commitment: payload.commitment,
          minimumAge: claim.value,
          asOf: row.asOf,
          requestHash: requestField(contextFor(row)),
        },
      };
    } else p = await generate(row, req.user.id);
    if (!(await verifyAge(p.proof, p.publicSignals, p.expected)))
      fail(400, "Cryptographic verification failed.");
    credentialId = p.record.id;
    result = {
      claim: { type: "age_over", minimumAge: claim.value, satisfied: true },
      method: "groth16",
    };
  } else {
    const { record, payload } = await activeCredential(
      req.user.id,
      claim.type === "qualification" ? "qualification" : "email",
    );
    credentialId = record.id;
    result =
      claim.type === "qualification"
        ? {
            claim: { type: "qualification", value: payload.qualification },
            method: "signed-credential",
          }
        : {
            claim: {
              type: "email_disclosure",
              email: unseal(record.secretCipher!, record.id).email,
              emailOwnership: payload.emailOwnership,
            },
            method: "explicit-disclosure",
          };
  }
  const code = random(),
    client = await db.client.findUniqueOrThrow({ where: { id: row.clientId } });
  await db.$transaction(
    async (tx) => {
      const credential = await tx.credential.findUnique({
        where: { id: credentialId },
      });
      if (
        !credential ||
        credential.revokedAt ||
        credential.expiresAt < new Date()
      )
        fail(400, "Credential is no longer active.");
      const updated = await tx.authorization.updateMany({
        where: {
          id: row.id,
          status: "pending",
          userId: req.user.id,
          expiresAt: { gt: new Date() },
        },
        data: {
          status: "approved",
          credentialId,
          codeHash: hash(code),
          codeExpiresAt: new Date(Date.now() + 60000),
          resultCipher: seal(
            {
              verified: true,
              subject: pairwise(req.user.id, row.clientId),
              trust: "demo-test-only",
              ...result,
            },
            row.id,
          ),
        },
      });
      if (!updated.count) fail(410, "Request expired or was already used.");
      await tx.connection.upsert({
        where: {
          userId_clientId: { userId: req.user.id, clientId: client.id },
        },
        create: { userId: req.user.id, clientId: client.id, name: client.name },
        update: { revokedAt: null, connectedAt: new Date() },
      });
      await tx.audit.create({
        data: {
          userId: req.user.id,
          event: "verification.approved",
          website: client.name,
          claim: claim.type,
          outcome: "success",
          credentialId,
          requestExpiresAt: row.expiresAt,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
  res.json({ redirectUrl: redirect(row, { code }) });
});
gateway.post("/requests/:id/reject", async (req, res) => {
  const row = await pending(String(req.params.id), req.user.id);
  if (row.userId !== req.user.id) fail(403, "Review the request first.");
  const updated = await db.authorization.updateMany({
    where: { id: row.id, status: "pending", userId: req.user.id },
    data: { status: "rejected" },
  });
  if (!updated.count) fail(410, "Request already used.");
  const client = await db.client.findUniqueOrThrow({
    where: { id: row.clientId },
  });
  await audit(
    req.user.id,
    "verification.rejected",
    "denied",
    client.name,
    JSON.parse(row.claims)[0].type,
  );
  res.json({ redirectUrl: redirect(row, { error: "access_denied" }) });
});
