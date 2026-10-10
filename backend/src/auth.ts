import { Router } from "express";
import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import nodemailer from "nodemailer";
import { randomInt } from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";
import { authSchema } from "./validation.js";
import { random, hash, seal, unseal, emailHash, equal } from "./security.js";
import { authenticate, audit, fail } from "./middleware.js";
export const auth = Router();
const throttle = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});
const cookie = {
  httpOnly: true,
  secure: config.production,
  sameSite: "lax" as const,
  path: "/api",
};
async function session(userId: string, res: any) {
  const token = random();
  await db.session.create({
    data: {
      id: hash(token),
      userId,
      csrf: random(),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });
  res.cookie("pg_session", token, { ...cookie, maxAge: 8 * 60 * 60 * 1000 });
}
auth.post("/register", throttle, async (req, res) => {
  const data = authSchema
    .extend({ confirmation: z.string(), consent: z.literal(true) })
    .strict()
    .parse(req.body);
  if (data.password !== data.confirmation) fail(400, "Passwords do not match.");
  const digest = emailHash(data.email);
  if (await db.user.findUnique({ where: { emailHash: digest } }))
    fail(409, "Account cannot be registered. Try signing in.");
  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const user = await db.user.create({
    data: {
      emailHash: digest,
      emailCipher: seal(data.email, "account-email"),
      passwordHash,
    },
  });
  await session(user.id, res);
  await audit(user.id, "account.registered");
  res.status(201).json({ ok: true });
});
auth.post("/login", throttle, async (req, res) => {
  const data = authSchema.parse(req.body);
  const user = await db.user.findUnique({
    where: { emailHash: emailHash(data.email) },
  });
  // Run an equivalent expensive hash for nonexistent users to reduce timing leakage.
  const valid = user
    ? await argon2.verify(user.passwordHash, data.password)
    : (await argon2.hash(data.password, {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
      false);
  if (!user || !valid) fail(401, "Email or password is incorrect.");
  if (req.cookies.pg_session)
    await db.session.deleteMany({
      where: { id: hash(req.cookies.pg_session) },
    });
  await session(user.id, res);
  await audit(user.id, "account.login");
  res.json({ ok: true });
});
auth.get("/session", authenticate, async (req, res) =>
  res.json({
    id: req.user.id,
    email: unseal(req.user.emailCipher, "account-email"),
    emailVerified: req.user.emailVerified,
    csrf: req.walletSession.csrf,
    expiresAt: req.walletSession.expiresAt,
    emailMode: process.env.SMTP_HOST ? "smtp" : "development-unverified",
  }),
);
auth.post("/logout", authenticate, async (req, res) => {
  await db.session.delete({ where: { id: req.walletSession.id } });
  res.clearCookie("pg_session", cookie);
  res.json({ ok: true });
});
auth.post("/logout-all", authenticate, async (req, res) => {
  await db.session.deleteMany({ where: { userId: req.user.id } });
  res.clearCookie("pg_session", cookie);
  res.json({ ok: true });
});
auth.post("/email-otp", throttle, authenticate, async (req, res) => {
  if (!process.env.SMTP_HOST)
    fail(
      503,
      "Development mode: email is unverified. Configure SMTP to prove email ownership. Demo email credentials remain test-only.",
    );
  const otp = String(randomInt(100000, 1000000));
  await db.emailOtp.upsert({
    where: { userId: req.user.id },
    create: {
      userId: req.user.id,
      digest: emailHash(req.user.id + otp),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
    update: {
      digest: emailHash(req.user.id + otp),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  });
  try {
    await nodemailer
      .createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_PORT === "465",
        requireTLS: true,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      })
      .sendMail({
        from: process.env.SMTP_FROM,
        to: unseal<string>(req.user.emailCipher, "account-email"),
        subject: "ProofGate email verification",
        text: `Your ProofGate verification code is ${otp}. It expires in 10 minutes.`,
      });
  } catch {
    fail(502, "Email delivery failed. Check SMTP configuration.");
  }
  res.json({ ok: true });
});
auth.post("/email-otp/verify", throttle, authenticate, async (req, res) => {
  const { otp } = z
    .object({ otp: z.string().regex(/^\d{6}$/) })
    .parse(req.body);
  const row = await db.emailOtp.findUnique({ where: { userId: req.user.id } });
  if (!row || row.expiresAt < new Date() || row.attempts >= 5)
    fail(400, "Code expired or unavailable. Request a new code.");
  const increment = await db.emailOtp.updateMany({
    where: {
      userId: req.user.id,
      attempts: { lt: 5 },
      expiresAt: { gt: new Date() },
    },
    data: { attempts: { increment: 1 } },
  });
  if (!increment.count || !equal(row.digest, emailHash(req.user.id + otp)))
    fail(400, "Incorrect verification code.");
  await db.$transaction([
    db.emailOtp.delete({ where: { userId: req.user.id } }),
    db.user.update({
      where: { id: req.user.id },
      data: { emailVerified: true },
    }),
  ]);
  await audit(req.user.id, "email.verified");
  res.json({ ok: true });
});
