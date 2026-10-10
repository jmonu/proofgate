import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, generateKeyPairSync } from "node:crypto";
if (existsSync(".env")) {
  console.log(".env exists; preserving configuration.");
  process.exit(0);
}
let contents = readFileSync(".env.example", "utf8");
const keys: Record<string, string> = {
  DATA_KEY: randomBytes(32).toString("hex"),
  PAIRWISE_KEY: randomBytes(32).toString("hex"),
  ISSUER_PRIVATE_KEY: Buffer.from(
    generateKeyPairSync("ed25519")
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString(),
  ).toString("base64"),
  DEMO_AGE_SECRET: randomBytes(32).toString("base64url"),
  DEMO_EMAIL_SECRET: randomBytes(32).toString("base64url"),
  DEMO_STUDENT_SECRET: randomBytes(32).toString("base64url"),
};
for (const [key, value] of Object.entries(keys))
  contents = contents.replace(
    new RegExp(`^${key}=.*$`, "m"),
    `${key}=${value}`,
  );
writeFileSync(".env", contents, { mode: 0o600, flag: "wx" });
console.log(
  "Created .env with fresh private keys. Set DATABASE_URL to your PostgreSQL connection string.",
);
