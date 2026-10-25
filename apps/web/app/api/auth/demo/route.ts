import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, users } from "@chiron/db";
import { createSession } from "@/src/lib/auth";
import { clearSubjectCookie } from "@/src/lib/subject";
import { apiError } from "@/src/lib/api";
import { authDevModeEnabled } from "@/src/lib/config";

export async function POST(): Promise<NextResponse> {
  if (!authDevModeEnabled()) {
    return apiError("NOT_FOUND", "Демо-вход отключён", 404);
  }

  const db = getDb();
  const rows = await db
    .insert(users)
    .values({
      email: "demo@chiron.local",
      displayName: "Демо-атлет",
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { deletedAt: null },
    })
    .returning();
  const user = rows[0];
  if (!user) return apiError("USER_ERROR", "Не удалось создать демо-пользователя", 500);

  await createSession(user.id);
  await clearSubjectCookie();
  return NextResponse.json({ ok: true });
}
