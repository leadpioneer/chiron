import { and, eq } from "drizzle-orm";
import { getDb, identities, users } from "@chiron/db";
import { telegramAllowlist } from "./config";
import type { TelegramUser } from "./telegram";

export type TelegramAuthOutcome =
  | { ok: true; userId: string }
  | {
      ok: false;
      code: "TELEGRAM_NOT_ALLOWED" | "ACCOUNT_DELETED" | "USER_ERROR";
      message: string;
      status: number;
    };

function isAllowed(user: TelegramUser, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const username = user.username?.toLowerCase();
  return allowlist.some(
    (entry) => entry === user.id || (username ? entry === username : false),
  );
}

export async function authenticateTelegramUser(
  telegramUser: TelegramUser,
): Promise<TelegramAuthOutcome> {
  const db = getDb();
  const identityRows = await db
    .select({ userId: identities.userId })
    .from(identities)
    .where(
      and(
        eq(identities.provider, "telegram"),
        eq(identities.providerUserId, telegramUser.id),
      ),
    )
    .limit(1);

  let userId = identityRows[0]?.userId;
  if (userId) {
    const userRows = await db
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!userRows[0] || userRows[0].deletedAt) {
      return {
        ok: false,
        code: "ACCOUNT_DELETED",
        message: "Этот аккаунт удалён.",
        status: 403,
      };
    }
    return { ok: true, userId };
  }

  const allowlist = telegramAllowlist();
  if (!isAllowed(telegramUser, allowlist)) {
    return {
      ok: false,
      code: "TELEGRAM_NOT_ALLOWED",
      message: "Доступ по приглашению. Обратитесь к администратору.",
      status: 403,
    };
  }

  const displayName =
    [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(" ") ||
    "Атлет";
  const insertedUsers = await db
    .insert(users)
    .values({
      displayName,
      locale: telegramUser.languageCode ?? "ru",
    })
    .returning({ id: users.id });
  userId = insertedUsers[0]?.id;
  if (!userId) {
    return {
      ok: false,
      code: "USER_ERROR",
      message: "Не удалось создать пользователя",
      status: 500,
    };
  }

  const insertedIdentity = await db
    .insert(identities)
    .values({
      userId,
      provider: "telegram",
      providerUserId: telegramUser.id,
    })
    .onConflictDoNothing()
    .returning({ userId: identities.userId });

  if (!insertedIdentity[0]) {
    await db.delete(users).where(eq(users.id, userId));
    const raced = await db
      .select({ userId: identities.userId })
      .from(identities)
      .where(
        and(
          eq(identities.provider, "telegram"),
          eq(identities.providerUserId, telegramUser.id),
        ),
      )
      .limit(1);
    const racedUserId = raced[0]?.userId;
    if (!racedUserId) {
      return {
        ok: false,
        code: "USER_ERROR",
        message: "Не удалось связать Telegram",
        status: 500,
      };
    }
    return { ok: true, userId: racedUserId };
  }

  return { ok: true, userId };
}
