import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  getDb,
  identities,
  sessions,
  trainingCycles,
  users,
} from "@chiron/db";
import { addDaysIso } from "@/src/lib/dates";
import {
  answerTelegramCallback,
  editTelegramMessage,
} from "@/src/lib/telegram-api";
import {
  RescheduleError,
  rescheduleSession,
} from "@/src/lib/reschedule-service";
import { todayInMoscow } from "@/src/lib/reminder-service";

interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: {
      message_id: number;
      text?: string;
      chat: { id: number };
    };
  };
}

function validSecret(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function answer(queryId: string, text: string): Promise<void> {
  try {
    await answerTelegramCallback(queryId, text);
  } catch (error) {
    console.error(
      "Telegram callback answer failed",
      error instanceof Error ? error.name : "unknown",
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!validSecret(request)) {
    return NextResponse.json(
      { ok: false, error: "invalid webhook secret" },
      { status: 403 },
    );
  }

  let update: TelegramUpdate | null = null;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const query = update?.callback_query;
  const data = query?.data ?? "";
  if (!query || !data) return NextResponse.json({ ok: true });

  if (data === "postpone_test") {
    await answer(
      query.id,
      "Тестовый режим: перенос станет доступен после онбординга.",
    );
    return NextResponse.json({ ok: true });
  }

  if (!data.startsWith("postpone:")) {
    return NextResponse.json({ ok: true });
  }

  const sessionId = data.slice("postpone:".length);
  const telegramId = String(query.from.id);
  const db = getDb();

  const identityRows = await db
    .select({ userId: identities.userId })
    .from(identities)
    .where(
      and(
        eq(identities.provider, "telegram"),
        eq(identities.providerUserId, telegramId),
      ),
    )
    .limit(1);
  const userId = identityRows[0]?.userId;
  if (!userId) {
    await answer(query.id, "Нет доступа к этой тренировке.");
    return NextResponse.json({ ok: true });
  }

  const userRows = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRows[0] || userRows[0].deletedAt) {
    await answer(query.id, "Аккаунт недоступен.");
    return NextResponse.json({ ok: true });
  }

  const sessionRows = await db
    .select({ session: sessions, cycle: trainingCycles })
    .from(sessions)
    .innerJoin(trainingCycles, eq(sessions.cycleId, trainingCycles.id))
    .where(
      and(eq(sessions.id, sessionId), eq(trainingCycles.userId, userId)),
    )
    .limit(1);
  const row = sessionRows[0];
  if (!row) {
    await answer(query.id, "Тренировка не найдена.");
    return NextResponse.json({ ok: true });
  }
  if (row.session.status !== "PLANNED") {
    await answer(
      query.id,
      row.session.status === "COMPLETED"
        ? "Тренировка уже завершена."
        : "Тренировка уже начата; перенос недоступен.",
    );
    return NextResponse.json({ ok: true });
  }

  const today = todayInMoscow();
  const tomorrow = addDaysIso(today, 1);
  try {
    await rescheduleSession(
      userId,
      sessionId,
      { newDate: tomorrow, mode: "SINGLE" },
      { today },
    );
    await answer(query.id, "Перенесено на завтра.");
    const message = query.message;
    if (message) {
      try {
        await editTelegramMessage(
          message.chat.id,
          message.message_id,
          `${message.text ?? "Тренировка"}\n\n✅ Перенесено на завтра.`,
          { replyMarkup: { inline_keyboard: [] } },
        );
      } catch (error) {
        console.error(
          "Telegram reminder edit failed",
          error instanceof Error ? error.name : "unknown",
        );
      }
    }
  } catch (error) {
    const text =
      error instanceof RescheduleError
        ? error.message
        : "Не удалось перенести тренировку.";
    console.error(
      "Telegram postpone failed",
      error instanceof Error ? error.message : "unknown",
    );
    await answer(query.id, text);
  }

  return NextResponse.json({ ok: true });
}
