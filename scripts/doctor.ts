import "dotenv/config";
import { assertArtifacts } from "../cryptography/proof.js";
import { db } from "../backend/src/db.js";
import { config } from "../backend/src/config.js";
export async function doctor() {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("Node.js 22 or newer is required.");
  if (config.DATABASE_URL.includes("CHANGE_ME"))
    throw new Error("Set DATABASE_URL in .env.");
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      "PostgreSQL is unreachable. Check DATABASE_URL and start the PostgreSQL service.",
    );
  }
  try {
    await db.user.count();
  } catch {
    throw new Error("Database schema missing. Run npm run db:migrate.");
  }
  try {
    await assertArtifacts();
  } catch {
    throw new Error("Proof artifacts missing. Run npm run crypto:build.");
  }
  if ((await db.client.count()) < 3)
    throw new Error("Demo clients missing. Run npm run db:seed.");
  console.log(
    "Ready: Node.js, PostgreSQL, schema, proof artifacts, and demo clients.",
  );
}
if (process.argv[1]?.endsWith("doctor.ts")) {
  try {
    await doctor();
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
