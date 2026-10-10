import { app } from "./app.js";
import { db } from "./db.js";
import { config } from "./config.js";
import { selfTestProofSystem } from "../../cryptography/proof.js";
import { cleanup } from "./maintenance.js";
await db.$connect();
await selfTestProofSystem();
await cleanup();
const maintenance = setInterval(
  () => {
    void cleanup().catch(() =>
      console.error(JSON.stringify({ event: "maintenance.failed" })),
    );
  },
  60 * 60 * 1000,
);
maintenance.unref();
const server = app.listen(config.PORT, "127.0.0.1", () =>
  console.log(`ProofGate gateway ready: ${config.GATEWAY_ORIGIN}`),
);
async function stop() {
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
