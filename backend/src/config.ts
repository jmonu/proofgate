import "dotenv/config";
import { resolve } from "node:path";
import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().startsWith("postgresql://"),
  DATA_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  PAIRWISE_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  ISSUER_PRIVATE_KEY: z.string().min(40),
  WALLET_ORIGIN: z.url().default("http://localhost:5174"),
  GATEWAY_ORIGIN: z.url().default("http://localhost:4000"),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PRIVATE_STORAGE: z.string().default("./private/documents"),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success)
  throw new Error(
    "Invalid configuration. Run npm run configure and set DATABASE_URL. Missing/invalid: " +
      parsed.error.issues.map((i) => i.path.join(".")).join(", "),
  );
export const config = {
  ...parsed.data,
  storage: resolve(parsed.data.PRIVATE_STORAGE),
  production: parsed.data.NODE_ENV === "production",
};
if (
  config.production &&
  (!config.WALLET_ORIGIN.startsWith("https://") ||
    !config.GATEWAY_ORIGIN.startsWith("https://") ||
    !process.env.CLAMSCAN_PATH)
)
  throw new Error("Production requires HTTPS origins and CLAMSCAN_PATH.");
