import "./load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "./client";

async function main(): Promise<void> {
  const db = getDb();
  await migrate(db, {
    migrationsFolder: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../drizzle",
    ),
  });
  console.log("Migrations applied.");
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
