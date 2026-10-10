import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db.js";
import { config } from "./config.js";
import {
  unseal,
  seal,
  signPayload,
  verifyPayload,
  issuerPublicKey,
  random,
} from "./security.js";
import { authenticate, audit, fail } from "./middleware.js";
import { type Profile } from "./validation.js";
import { newSalt, poseidonHash } from "../../cryptography/proof.js";
export const credentials = Router();
export const issuer = {
  id: "urn:proofgate:demo-issuer:v1",
  name: "ProofGate Demo Issuer",
  trust: "demo-test-only",
  publicKey: issuerPublicKey,
  format:
    "ProofGate demo credential v1 — Ed25519 signed JSON; not a W3C VC implementation",
};
credentials.get("/issuer", (_req, res) => res.json(issuer));
credentials.get("/status/:id", async (req, res) => {
  const c = await db.credential.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!c) fail(404, "Unknown status identifier.");
  res.json({
    active: !c.revokedAt && c.expiresAt > new Date(),
    expiresAt: c.expiresAt,
    revoked: !!c.revokedAt,
  });
});
credentials.use(authenticate);
credentials.get("/", async (req, res) => {
  const rows = await db.credential.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    rows.map((c) => ({
      id: c.id,
      type: c.type,
      sourceId: c.sourceId,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      revokedAt: c.revokedAt,
      trust: "demo-test-only",
      emailOwnership:
        c.type === "email" ? JSON.parse(c.payload).emailOwnership : undefined,
    })),
  );
});
credentials.post("/issue", async (req, res) => {
  const data = z
    .object({
      type: z.enum(["age", "email", "qualification"]),
      reviewed: z.literal(true),
      understandDemo: z.literal(true),
      dobConfirmation: z.string().optional(),
    })
    .strict()
    .parse(req.body);
  const profile = req.user.profile
    ? unseal<Profile>(req.user.profile, req.user.id)
    : null;
  let sourceId: string | undefined, secret: any, claim: any;
  if (data.type === "age") {
    if (!profile || data.dobConfirmation !== profile.dob)
      fail(
        400,
        "Review your identity and re-enter its date of birth for the test issuer.",
      );
    const salt = newSalt(),
      dob = Number(profile.dob.replaceAll("-", ""));
    secret = { dob, salt };
    claim = { commitment: await poseidonHash([dob, salt]) };
  } else if (data.type === "qualification") {
    const doc = await db.document.findUnique({
      where: { userId_category: { userId: req.user.id, category: "btech" } },
    });
    if (!doc)
      fail(
        400,
        "Upload and review a B.Tech source document before requesting a test credential.",
      );
    sourceId = doc.id;
    claim = { qualification: "btech" };
  } else {
    claim = {
      emailOwnership: req.user.emailVerified
        ? "smtp-verified"
        : "unverified-demo",
    };
    secret = { email: unseal<string>(req.user.emailCipher, "account-email") };
  }
  const id = randomUUID(),
    expiresAt = new Date(Date.now() + 30 * 86400000);
  const payload = JSON.stringify({
    format: "ProofGateCredential-v1",
    id,
    issuer: issuer.id,
    subject: random(),
    type: data.type,
    trust: "demo-test-only",
    issuedAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: `${config.GATEWAY_ORIGIN}/api/credentials/status/${id}`,
    ...claim,
  });
  await db.$transaction([
    db.credential.updateMany({
      where: { userId: req.user.id, type: data.type, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    db.credential.create({
      data: {
        id,
        userId: req.user.id,
        type: data.type,
        sourceId,
        payload,
        signature: signPayload(payload),
        secretCipher: secret ? seal(secret, id) : null,
        expiresAt,
      },
    }),
  ]);
  await audit(
    req.user.id,
    "credential.demo-issued",
    "success",
    undefined,
    data.type,
  );
  res.status(201).json({ id, trust: "demo-test-only", expiresAt });
});
credentials.post("/:id/revoke", async (req, res) => {
  const result = await db.credential.updateMany({
    where: { id: String(req.params.id), userId: req.user.id },
    data: { revokedAt: new Date() },
  });
  if (!result.count) fail(404, "Credential not found.");
  await audit(req.user.id, "credential.revoked");
  res.json({ ok: true });
});
export async function activeCredential(userId: string, type: string) {
  const c = await db.credential.findFirst({
    where: { userId, type, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!c || !verifyPayload(c.payload, c.signature))
    fail(
      400,
      "An active, valid demo credential is required. Visit Credentials to issue one.",
    );
  const payload = JSON.parse(c.payload);
  if (
    payload.issuer !== issuer.id ||
    payload.id !== c.id ||
    payload.type !== type ||
    payload.expiresAt !== c.expiresAt.toISOString()
  )
    fail(400, "Credential integrity check failed.");
  return { record: c, payload };
}
