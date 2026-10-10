import "dotenv/config";
import { db } from "../backend/src/db.js";
import { createHash } from "node:crypto";
const clients = [
  {
    id: "demo-age",
    name: "Afterhours",
    port: 4101,
    key: "DEMO_AGE_SECRET",
    claims: [{ type: "age_over", value: 18 }],
  },
  {
    id: "demo-email",
    name: "Letterbox",
    port: 4102,
    key: "DEMO_EMAIL_SECRET",
    claims: [{ type: "email_disclosure" }],
  },
  {
    id: "demo-student",
    name: "Campus Collective",
    port: 4103,
    key: "DEMO_STUDENT_SECRET",
    claims: [{ type: "qualification", value: "btech" }],
  },
];
try {
  for (const c of clients) {
    const secret = process.env[c.key];
    if (!secret || secret.length < 32) throw new Error(`Configure ${c.key}.`);
    const data = {
      name: c.name,
      secretHash: createHash("sha256").update(secret).digest("hex"),
      origin: `http://localhost:${c.port}`,
      redirectUri: `http://localhost:${c.port}/callback`,
      claims: JSON.stringify(c.claims),
    };
    await db.client.upsert({
      where: { id: c.id },
      create: { id: c.id, ...data },
      update: data,
    });
  }
  console.log(
    "Registered three local demo clients. No user accounts or credentials were seeded.",
  );
} finally {
  await db.$disconnect();
}
