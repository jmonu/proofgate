import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { doctor } from "./doctor.js";
import { db } from "../backend/src/db.js";
import { config } from "../backend/src/config.js";
try {
  await doctor();
} catch (e) {
  console.error((e as Error).message);
  await db.$disconnect();
  process.exit(1);
}
await db.$disconnect();
const children: ChildProcess[] = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill());
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function start(args: string[]) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  });
  children.push(child);
  child.on("exit", (code) => stop(code ?? 1));
  child.on("error", () => stop(1));
}
start(["--import", "tsx", "backend/src/index.ts"]);
let ready = false;
for (let i = 0; i < 150 && !stopping; i++) {
  try {
    const response = await fetch(config.GATEWAY_ORIGIN + "/health", {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {}
  await delay(200);
}
if (!ready) {
  console.error(
    "Gateway failed startup checks. Check database and proof artifacts.",
  );
  stop(1);
} else {
  start([
    "node_modules/vite/bin/vite.js",
    "--config",
    "frontend/vite.config.ts",
  ]);
  start(["--import", "tsx", "demo-sites/server.ts"]);
}
