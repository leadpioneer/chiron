import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@chiron/db";
import { llmStatus } from "@/src/lib/llm";

export async function GET(): Promise<NextResponse> {
  const llm = llmStatus();
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json(
      {
        ok: true,
        db: "up",
        llm: {
          enabled: llm.enabled,
          configured: llm.configured,
          provider: llm.provider,
          model: llm.model,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, db: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
