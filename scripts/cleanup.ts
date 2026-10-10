import "dotenv/config";
import { db } from "../backend/src/db.js";
import { cleanup } from "../backend/src/maintenance.js";
// Run daily. Keep only redacted audit metadata for 30 days.
try {
  await cleanup();
  console.log(
    "Expired authorization data, sessions, OTPs and old audit metadata removed.",
  );
} finally {
  await db.$disconnect();
}
