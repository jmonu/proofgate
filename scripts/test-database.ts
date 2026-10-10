import { mkdir, readFile, writeFile, unlink, access } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes, generateKeyPairSync } from "node:crypto";
import { parse } from "dotenv";
import pg from "pg";
if (process.platform !== "win32")
  throw new Error(
    "On other platforms configure .env.test.local with a PostgreSQL database named proofgate_test.",
  );
const { initdb, pg_ctl } = await import("@embedded-postgres/windows-x64");
const dir = resolve("private/test-postgres");
const envFile = resolve(".env.test.local");
let env: Record<string, string>;
try {
  env = parse(await readFile(envFile));
} catch {
  const password = randomBytes(32).toString("hex");
  env = {
    DATABASE_URL: `postgresql://proofgate_test:${password}@localhost:55432/proofgate_test?schema=public`,
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
    WALLET_ORIGIN: "http://localhost:5174",
    GATEWAY_ORIGIN: "http://localhost:4000",
    PRIVATE_STORAGE: "./private/test-documents",
    NODE_ENV: "test",
  };
  await writeFile(
    envFile,
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
}
function run(binary: string, args: string[], allowed = [0]) {
  const r = spawnSync(binary, args, {
    stdio: "ignore",
    windowsHide: true,
    timeout: 30000,
  });
  if (!allowed.includes(r.status ?? 1)) {
    throw new Error(
      "Test database command failed. See private/test-postgres.log.",
    );
  }
  return r.status;
}
if (process.argv.includes("--stop")) {
  run(pg_ctl, ["-D", dir, "-m", "fast", "-w", "stop"], [0, 1, 3]);
  process.exit(0);
}
await mkdir(dir, { recursive: true });
try {
  await access(resolve(dir, "PG_VERSION"));
} catch {
  const passwordFile = resolve("private/test-db-password");
  await writeFile(
    passwordFile,
    decodeURIComponent(new URL(env.DATABASE_URL).password),
    { mode: 0o600, flag: "wx" },
  );
  try {
    run(initdb, [
      "-D",
      dir,
      "-U",
      "proofgate_test",
      "--pwfile",
      passwordFile,
      "--auth-host=scram-sha-256",
      "--auth-local=scram-sha-256",
      "--encoding=UTF8",
      "--locale=C",
    ]);
  } finally {
    await unlink(passwordFile);
  }
}
const status = run(pg_ctl, ["-D", dir, "status"], [0, 3]);
if (status !== 0)
  run(pg_ctl, [
    "-D",
    dir,
    "-l",
    resolve("private/test-postgres.log"),
    "-o",
    "-h 127.0.0.1 -p 55432",
    "-w",
    "start",
  ]);
const url = new URL(env.DATABASE_URL);
url.pathname = "/postgres";
url.search = "";
const admin = new pg.Client({ connectionString: url.toString() });
await admin.connect();
if (
  !(
    await admin.query(
      "SELECT 1 FROM pg_database WHERE datname='proofgate_test'",
    )
  ).rowCount
)
  await admin.query("CREATE DATABASE proofgate_test");
await admin.end();
for (const args of [
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "database/schema.prisma",
  ],
  ["node_modules/tsx/dist/cli.mjs", "scripts/seed.ts"],
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  "Isolated PostgreSQL test database ready on localhost:55432. Your .env and port 5432 are unchanged.",
);
