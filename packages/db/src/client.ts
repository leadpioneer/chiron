import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let sql: ReturnType<typeof postgres> | null = null;
let database: Db | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (database) return database;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  sql = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  database = drizzle(sql, { schema });
  return database;
}

export function getClient(): ReturnType<typeof postgres> {
  if (!sql) getDb();
  if (!sql) throw new Error("Database client is not initialized");
  return sql;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
    database = null;
  }
}

export { schema };
