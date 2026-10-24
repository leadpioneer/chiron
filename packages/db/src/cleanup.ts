import { and, isNotNull, lt, or } from "drizzle-orm";
import { getDb } from "./client";
import { magicLinks } from "./schema";

export interface CleanupResult {
  magicLinksDeleted: number;
}

export async function cleanupOldMagicLinks(
  now = new Date(),
  retentionHours = 24,
): Promise<CleanupResult> {
  const cutoff = new Date(now.getTime() - retentionHours * 60 * 60_000);
  const rows = await getDb()
    .delete(magicLinks)
    .where(
      and(
        lt(magicLinks.createdAt, cutoff),
        or(isNotNull(magicLinks.usedAt), lt(magicLinks.expiresAt, now)),
      ),
    )
    .returning({ id: magicLinks.id });
  return { magicLinksDeleted: rows.length };
}
