import { and, eq } from "drizzle-orm";
import {
  auditEvents,
  getDb,
  identities,
  sessions,
  trainingCycles,
  users,
} from "@chiron/db";
import { addDaysIso } from "./dates";
import { sendTelegramMessage } from "./telegram-api";

export interface DueReminder {
  sessionId: string;
  userId: string;
  telegramId: string;
  sessionKey: string;
}

export function todayInMoscow(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function tomorrowInMoscow(now: Date = new Date()): string {
  return addDaysIso(todayInMoscow(now), 1);
}

function reminderText(item: DueReminder): string {
  const title = item.sessionKey === "A" ? "Тяни" : "Толкай";
  return `Сегодня тренировка «${title}».`;
}

export async function getDueReminders(
  today = todayInMoscow(),
): Promise<DueReminder[]> {
  const db = getDb();
  const rows = await db
    .select({
      sessionId: sessions.id,
      sessionKey: sessions.sessionKey,
      userId: users.id,
      telegramId: identities.providerUserId,
    })
    .from(sessions)
    .innerJoin(trainingCycles, eq(sessions.cycleId, trainingCycles.id))
    .innerJoin(users, eq(trainingCycles.userId, users.id))
    .innerJoin(
      identities,
      and(
        eq(identities.userId, users.id),
        eq(identities.provider, "telegram"),
      ),
    )
    .where(
      and(
        eq(sessions.plannedDate, today),
        eq(sessions.status, "PLANNED"),
        eq(trainingCycles.status, "ACTIVE"),
      ),
    );

  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!unique.has(row.sessionId)) unique.set(row.sessionId, row);
  }

  const due: DueReminder[] = [];
  for (const row of unique.values()) {
    const sentRows = await db
      .select({ payload: auditEvents.payload })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.userId, row.userId),
          eq(auditEvents.entity, "session"),
          eq(auditEvents.entityId, row.sessionId),
          eq(auditEvents.eventType, "REMINDER_SENT"),
        ),
      );
    const alreadySent = sentRows.some(
      (event) => (event.payload as { date?: string } | null)?.date === today,
    );
    if (alreadySent) continue;

    due.push({
      sessionId: row.sessionId,
      userId: row.userId,
      telegramId: row.telegramId,
      sessionKey: row.sessionKey,
    });
  }
  return due;
}

export interface SendRemindersResult {
  sent: number;
  failed: Array<{ sessionId: string; error: string }>;
}

export async function sendDueReminders(
  today = todayInMoscow(),
): Promise<SendRemindersResult> {
  const db = getDb();
  const due = await getDueReminders(today);
  const result: SendRemindersResult = { sent: 0, failed: [] };

  for (const item of due) {
    try {
      await sendTelegramMessage(item.telegramId, reminderText(item), {
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: "Отложить на завтра",
                callback_data: `postpone:${item.sessionId}`,
              },
              {
                text: "Окей",
                callback_data: `dismiss:${item.sessionId}`,
              },
            ],
          ],
        },
      });
      await db.insert(auditEvents).values({
        userId: item.userId,
        actorUserId: item.userId,
        entity: "session",
        entityId: item.sessionId,
        eventType: "REMINDER_SENT",
        payload: { date: today, channel: "telegram" },
        versions: { rules: "1.0.0" },
      });
      result.sent += 1;
    } catch (error) {
      result.failed.push({
        sessionId: item.sessionId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return result;
}

export async function sendTestReminder(
  telegramId: string,
): Promise<{ messageId: number; sessionId: string | null }> {
  const due = await getDueReminders(todayInMoscow());
  const match = due.find((item) => item.telegramId === telegramId);
  const text = match
    ? `Тестовое напоминание.\n\n${reminderText(match)}`
    : "Тестовое напоминание. Сегодня тренировка.";
  const callbackData = match
    ? `postpone:${match.sessionId}`
    : "postpone_test";
  const dismissData = match
    ? `dismiss:${match.sessionId}`
    : "dismiss_test";
  const message = await sendTelegramMessage(telegramId, text, {
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "Отложить на завтра",
            callback_data: callbackData,
          },
          {
            text: "Окей",
            callback_data: dismissData,
          },
        ],
      ],
    },
  });
  return {
    messageId: message.message_id,
    sessionId: match?.sessionId ?? null,
  };
}
