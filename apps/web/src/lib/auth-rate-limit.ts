import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, magicLinks } from "@chiron/db";
import type { LimitDecision } from "./security";

const WINDOW_MS = 15 * 60_000;
const MAX_LINKS = 5;
const COOLDOWN_MS = 30_000;

export async function magicLinkEmailLimit(
  email: string,
  now = Date.now(),
): Promise<LimitDecision> {
  const since = new Date(now - WINDOW_MS);
  const rows = await getDb()
    .select({
      count: sql<number>`count(*)::int`,
      oldest: sql<string | null>`min(${magicLinks.createdAt})::text`,
      newest: sql<string | null>`max(${magicLinks.createdAt})::text`,
    })
    .from(magicLinks)
    .where(and(eq(magicLinks.email, email), gte(magicLinks.createdAt, since)));

  const count = Number(rows[0]?.count ?? 0);
  const oldest = rows[0]?.oldest ? new Date(rows[0].oldest).getTime() : 0;
  const newest = rows[0]?.newest ? new Date(rows[0].newest).getTime() : 0;

  if (newest > 0 && now - newest < COOLDOWN_MS) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((COOLDOWN_MS - (now - newest)) / 1000),
      ),
      remaining: 0,
    };
  }

  if (count >= MAX_LINKS) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldest + WINDOW_MS - now) / 1000),
      ),
      remaining: 0,
    };
  }

  return {
    ok: true,
    retryAfterSeconds: 0,
    remaining: MAX_LINKS - count - 1,
  };
}
