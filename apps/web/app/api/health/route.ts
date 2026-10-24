import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@chiron/db";

export async function GET(): Promise<NextResponse> {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
