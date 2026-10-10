import { db } from "./db.js";
export async function cleanup() {
  const now = new Date();
  await db.$transaction([
    db.authorization.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.emailOtp.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.audit.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } },
    }),
  ]);
}
