import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const { cleanupOldMagicLinks, closeDb } = await import("@chiron/db");

try {
  const result = await cleanupOldMagicLinks();
  console.info(
    JSON.stringify({ event: "cleanup", magicLinksDeleted: result.magicLinksDeleted }),
  );
} finally {
  await closeDb();
}
