import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ path: path.resolve(process.cwd(), ".env") });

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL must be configured");
  }
  const url = new URL(base);
  url.pathname = "/chiron_test";
  return url.toString();
}

const testDb = testDatabaseUrl();
const serverEnv = {
  ...process.env,
  DATABASE_URL: testDb,
  TEST_DATABASE_URL: testDb,
  AUTH_DEV_MODE: "1",
  AUTH_SECRET: "e2e-secret-change-me-32-characters",
  APP_URL: baseURL,
  PORT: String(PORT),
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  outputDir: "test-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: "ru-RU",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    command: `npm run dev --workspace @chiron/web -- --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: serverEnv,
  },
});
