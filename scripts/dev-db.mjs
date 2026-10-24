import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(import.meta.dirname, "..");
const dataDir =
  process.env.CHIRON_PG_DATA_DIR ??
  path.join(os.homedir(), ".chiron", "pgdata");
const port = 55432;
const connectionString = `postgres://chiron:chiron@localhost:${port}/chiron`;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "chiron",
  password: "chiron",
  port,
  persistent: true,
  authMethod: "password",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: (message) => console.log(`[pg] ${message}`),
  onError: (error) => console.error(`[pg] ${error}`),
});

fs.mkdirSync(path.dirname(dataDir), { recursive: true });
if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.log(`Initialising local PostgreSQL cluster in ${dataDir}...`);
  await pg.initialise();
}

await pg.start();
const adminClient = pg.getPgClient("postgres");
await adminClient.connect();
const existingDatabase = await adminClient.query(
  "select 1 from pg_database where datname = 'chiron'",
);
if (existingDatabase.rowCount === 0) {
  await pg.createDatabase("chiron");
  console.log("Created database chiron.");
} else {
  console.log("Database chiron already exists.");
}
await adminClient.end();

const env = { ...process.env, DATABASE_URL: connectionString };
const npmCli = process.env.npm_execpath;
for (const script of ["db:migrate", "db:seed"]) {
  console.log(`Running npm run ${script}...`);
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
    await pg.stop();
    process.exit(result.status ?? 1);
  }
}

console.log("");
console.log("DEV_DB_READY");
console.log(`DATABASE_URL=${connectionString}`);
console.log("PostgreSQL is running. Keep this terminal open and run: npm run dev");
console.log("Press Ctrl+C to stop the database.");

async function shutdown() {
  await pg.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
