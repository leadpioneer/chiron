import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { telegramAuthSchema } from "@chiron/contracts";
import {
  getDb,
  identities,
  users,
} from "@chiron/db";
import { createSession } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import { verifyTelegramInitData } from "@/src/lib/telegram";

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await readJson(request, telegramAuthSchema);
  if (!parsed.ok) return parsed.response;

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const verification = verifyTelegramInitData(parsed.data.initData, botToken);
  if (!verification.ok || !verification.user) {
    return apiError(
      "TELEGRAM_AUTH_FAILED",
      verification.reason ?? "Не удалось проверить Telegram",
      401,
    );
  }

  const db = getDb();
  const identityRows = await db
    .select()
    .from(identities)
    .where(
      and(
        eq(identities.provider, "telegram"),
        eq(identities.providerUserId, verification.user.id),
      ),
    )
    .limit(1);

  let userId = identityRows[0]?.userId;
  if (!userId) {
    const displayName =
      [verification.user.firstName, verification.user.lastName]
        .filter(Boolean)
        .join(" ") || "Атлет";
    const userRows = await db
      .insert(users)
      .values({ displayName, locale: verification.user.languageCode ?? "ru" })
      .returning();
    const user = userRows[0];
    if (!user) return apiError("USER_ERROR", "Не удалось создать пользователя", 500);
    userId = user.id;
    await db
      .insert(identities)
      .values({
        userId,
        provider: "telegram",
        providerUserId: verification.user.id,
      })
      .onConflictDoNothing();
  }

  await createSession(userId);
  return NextResponse.json({ ok: true });
}
