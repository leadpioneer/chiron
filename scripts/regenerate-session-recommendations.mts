import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb, sessionPerformances } from "@chiron/db";
import type { SessionRpe } from "@chiron/contracts";
import { createSessionRecommendations } from "../apps/web/src/lib/recommendation-service";

const userId = process.argv[2];
const sessionId = process.argv[3];
if (!userId || !sessionId) {
  console.error(
    "Usage: npx tsx scripts/regenerate-session-recommendations.mts <userId> <sessionId>",
  );
  process.exit(1);
}

const db = getDb();
const performance = await db
  .select()
  .from(sessionPerformances)
  .where(eq(sessionPerformances.sessionId, sessionId))
  .limit(1);

const views = await createSessionRecommendations(
  {
    userId,
    sessionId,
    sessionRpe: (performance[0]?.sessionRpe ?? "MODERATE") as SessionRpe,
    comment: performance[0]?.comment ?? null,
    regenerate: true,
  },
  { today: new Date().toISOString().slice(0, 10) },
);

console.log(
  JSON.stringify(
    views.map((view) => ({
      id: view.id,
      action: view.action,
      scopeId: view.scopeId,
      status: view.status,
      explanation: view.explanation,
    })),
    null,
    2,
  ),
);
