import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.test.local", override: true, quiet: true });
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://localhost:5174",
    headless: true,
    channel: "msedge",
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node node_modules/tsx/dist/cli.mjs scripts/dev.ts",
    url: "http://localhost:5174",
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: "list",
});
