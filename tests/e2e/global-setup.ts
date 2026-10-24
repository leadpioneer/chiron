import path from "node:path";
import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: path.resolve(process.cwd(), ".env") });

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

export default async function globalSetup(): Promise<void> {
  const url = testDatabaseUrl();
  const databaseName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(databaseName)) {
    throw new Error(`Refusing to run E2E against ${databaseName}`);
  }

  const env = { ...process.env, TEST_DATABASE_URL: url };
  const npmCli = process.env.npm_execpath;
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, "run", "db:test:prepare"], {
        cwd: process.cwd(),
        env,
        stdio: "inherit",
      })
    : spawnSync("npm", ["run", "db:test:prepare"], {
        cwd: process.cwd(),
        env,
        stdio: "inherit",
        shell: true,
      });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`db:test:prepare failed with ${result.status}`);
  }

  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await sql.unsafe('truncate table "users" cascade');
  } finally {
    await sql.end();
  }
}
