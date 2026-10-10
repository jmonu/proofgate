import { defineConfig } from "vitest/config";
import { config } from "dotenv";
config({ path: ".env.test.local", override: true, quiet: true });
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
