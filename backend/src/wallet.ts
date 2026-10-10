import { documentStore } from "./storage.js";
import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { db } from "./db.js";
import { config } from "./config.js";
import { seal, unseal, random } from "./security.js";
import { authenticate, audit, fail } from "./middleware.js";
import { identitySchema, calculateAge, type Profile } from "./validation.js";
export const wallet = Router();
wallet.use(authenticate);
wallet.get("/identity", async (req, res) => {
  const profile = req.user.profile
    ? unseal<Profile>(req.user.profile, req.user.id)
    : null;
  res.json({
    profile,
    age: profile ? calculateAge(profile.dob) : null,
    trust: "self-entered",
  });
});
wallet.put("/identity", async (req, res) => {
  const profile = identitySchema.parse(req.body);
  if (profile.email !== unseal<string>(req.user.emailCipher, "account-email"))
    fail(
      400,
      "Use your account email. Account email changes are not supported.",
    );
  await db.$transaction([
    db.user.update({
      where: { id: req.user.id },
      data: { profile: seal(profile, req.user.id) },
    }),
    db.credential.updateMany({
      where: { userId: req.user.id, type: "age", revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await audit(req.user.id, "identity.updated");
  res.json({ profile, age: calculateAge(profile.dob), trust: "self-entered" });
});
wallet.get("/age", async (req, res) => {
  if (!req.user.profile) fail(400, "Create your identity first.");
  res.json({
    age: calculateAge(unseal<Profile>(req.user.profile, req.user.id).dob),
  });
});
wallet.get("/summary", async (req, res) => {
  const [documents, credentials, verifications, activity] = await Promise.all([
    db.document.count({ where: { userId: req.user.id } }),
    db.credential.count({
      where: {
        userId: req.user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
    db.audit.count({
      where: {
        userId: req.user.id,
        event: "verification.approved",
        outcome: "success",
      },
    }),
    db.audit.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);
  res.json({
    identityComplete: !!req.user.profile,
    documents,
    credentials,
    verifications,
    activity,
  });
});
const categories = z.enum(["tenth", "intermediate", "btech"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 },
});
wallet.get("/documents", async (req, res) => {
  const docs = await db.document.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  const credentials = await db.credential.findMany({
    where: {
      userId: req.user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  res.json(
    docs.map((d) => ({
      id: d.id,
      category: d.category,
      name: unseal(d.nameCipher, req.user.id),
      mime: d.mime,
      size: d.size,
      createdAt: d.createdAt,
      scanStatus: d.scanStatus,
      credentialIssued: credentials.some((c) => c.sourceId === d.id),
    })),
  );
});
wallet.post("/documents/:category", upload.single("file"), async (req, res) => {
  const category = categories.parse(req.params.category);
  const file = req.file;
  if (!file) fail(400, "Choose a PDF, PNG, or JPEG file.");
  const kind = await fileTypeFromBuffer(file.buffer).catch(() => undefined);
  const allowed: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "image/png": ["png"],
    "image/jpeg": ["jpg", "jpeg"],
  };
  const extension = file.originalname.split(".").pop()?.toLowerCase() || "";
  if (
    !kind ||
    !allowed[kind.mime]?.includes(extension) ||
    kind.mime !== file.mimetype
  )
    fail(
      400,
      "File extension, declared MIME type, and file signature must match a PDF, PNG, or JPEG.",
    );
  let scanStatus = "not-scanned-development";
  await mkdir(config.storage, { recursive: true });
  const storageId = random();
  if (process.env.CLAMSCAN_PATH) {
    const scratch = resolve(config.storage, storageId + ".scan");
    try {
      await writeFile(scratch, file.buffer, { flag: "wx", mode: 0o600 });
      await promisify(execFile)(
        process.env.CLAMSCAN_PATH,
        ["--no-summary", scratch],
        { timeout: 30000 },
      );
      scanStatus = "scanner-passed";
    } catch {
      fail(422, "Malware scan failed or rejected this file.");
    } finally {
      await unlink(scratch).catch(() => {});
    }
  }
  await documentStore.put(storageId, req.user.id, file.buffer);
  let old: any;
  try {
    await db.$transaction(async (tx) => {
      old = await tx.document.findUnique({
        where: { userId_category: { userId: req.user.id, category } },
      });
      if (old) {
        await tx.credential.updateMany({
          where: { userId: req.user.id, sourceId: old.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.document.delete({ where: { id: old.id } });
      }
      await tx.document.create({
        data: {
          userId: req.user.id,
          category,
          nameCipher: seal(file.originalname.slice(0, 160), req.user.id),
          mime: kind.mime,
          size: file.size,
          storageId,
          scanStatus,
        },
      });
    });
  } catch (e) {
    await documentStore.remove(storageId).catch(() => {});
    throw e;
  }
  if (old) await documentStore.remove(old.storageId).catch(() => {});
  await audit(req.user.id, "document.uploaded");
  res.status(201).json({ ok: true, scanStatus });
});
wallet.get("/documents/:id/file", async (req, res) => {
  const doc = await db.document.findFirst({
    where: { id: String(req.params.id), userId: req.user.id },
  });
  if (!doc) fail(404, "Document not found.");
  const file = await documentStore.get(doc.storageId, req.user.id);
  res.setHeader("Content-Type", doc.mime);
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  res.setHeader(
    "Content-Disposition",
    `${req.query.download === "1" ? "attachment" : "inline"}; filename="document.${doc.mime === "application/pdf" ? "pdf" : doc.mime === "image/png" ? "png" : "jpg"}"`,
  );
  res.send(file);
});
wallet.delete("/documents/:id", async (req, res) => {
  const doc = await db.document.findFirst({
    where: { id: String(req.params.id), userId: req.user.id },
  });
  if (!doc) fail(404, "Document not found.");
  await db.$transaction([
    db.credential.updateMany({
      where: { userId: req.user.id, sourceId: doc.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    db.document.delete({ where: { id: doc.id } }),
  ]);
  await documentStore.remove(doc.storageId).catch(() => {});
  await audit(req.user.id, "document.deleted");
  res.json({ ok: true });
});
wallet.get("/history", async (req, res) => {
  const events = await db.audit.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const creds = await db.credential.findMany({
    where: {
      userId: req.user.id,
      id: {
        in: events.flatMap((e) => (e.credentialId ? [e.credentialId] : [])),
      },
    },
    select: { id: true, revokedAt: true, expiresAt: true },
  });
  res.json(
    events.map(({ credentialId, ...event }) => {
      const c = creds.find((c) => c.id === credentialId);
      return {
        ...event,
        validity: c?.revokedAt
          ? "credential revoked"
          : c && c.expiresAt < new Date()
            ? "credential expired"
            : event.requestExpiresAt && event.requestExpiresAt < new Date()
              ? "authorization expired"
              : event.requestExpiresAt
                ? "authorization active"
                : null,
      };
    }),
  );
});
wallet.get("/connections", async (req, res) =>
  res.json(
    await db.connection.findMany({
      where: { userId: req.user.id, revokedAt: null },
    }),
  ),
);
wallet.delete("/connections/:id", async (req, res) => {
  const connection = await db.connection.findFirst({
    where: { id: String(req.params.id), userId: req.user.id },
  });
  if (!connection) fail(404, "Connection not found.");
  await db.$transaction([
    db.connection.update({
      where: { id: connection.id },
      data: { revokedAt: new Date() },
    }),
    db.authorization.updateMany({
      where: {
        userId: req.user.id,
        clientId: connection.clientId,
        status: { in: ["pending", "approved"] },
      },
      data: { status: "revoked", codeHash: null, resultCipher: null },
    }),
  ]);
  await audit(req.user.id, "website.disconnected", "success", connection.name);
  res.json({ ok: true });
});
