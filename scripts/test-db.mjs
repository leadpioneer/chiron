import path from "node:path";
import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const root = path.resolve(import.meta.dirname, "..");
loadEnv({ path: path.join(root, ".env") });

function testUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL must be configured");
  }
  const url = new URL(base);
  url.pathname = "/chiron_test";
  return url.toString();
}

const url = testUrl();
const target = new URL(url);
const databaseName = target.pathname.replace(/^\//, "");
if (!databaseName) throw new Error("Test database name is empty");

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1 });
try {
  const existing = await admin`
    select 1 from pg_database where datname = ${databaseName}
  `;
  if (existing.length === 0) {
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    console.log(`Created database ${databaseName}.`);
  } else {
    console.log(`Database ${databaseName} already exists.`);
  }
} finally {
  await admin.end();
}

const env = { ...process.env, DATABASE_URL: url };
const npmCli = process.env.npm_execpath;
for (const script of ["db:migrate", "db:seed"]) {
  console.log(`Running npm run ${script} on ${databaseName}...`);
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, "run", script], {
        cwd: root,
        env,
        stdio: "inherit",
      })
    : spawnSync("npm", ["run", script], {
        cwd: root,
        env,
        stdio: "inherit",
        shell: true,
      });
  if (result.error) {
    console.error(`Could not start npm run ${script}:`, result.error);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`TEST_DB_READY=${url}`);
