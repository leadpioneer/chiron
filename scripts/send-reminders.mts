import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const {
  getDueReminders,
  sendDueReminders,
  sendTestReminder,
  todayInMoscow,
} = await import("../apps/web/src/lib/reminder-service");
const { closeDb } = await import("@chiron/db");

const args = process.argv.slice(2);
const testArg = args.find((arg) =>
  arg.startsWith("--test-telegram-id="),
);

try {
  if (testArg) {
    const telegramId = testArg.slice("--test-telegram-id=".length).trim();
    if (!telegramId) throw new Error("telegram id is empty");
    const result = await sendTestReminder(telegramId);
    console.info(
      JSON.stringify({
        event: "test_reminder_sent",
        messageId: result.messageId,
      }),
    );
  } else if (args.includes("--dry-run")) {
    const today = todayInMoscow();
    const due = await getDueReminders(today);
    console.info(
      JSON.stringify({
        event: "reminders_dry_run",
        today,
        count: due.length,
      }),
    );
  } else {
    const today = todayInMoscow();
    const result = await sendDueReminders(today);
    console.info(
      JSON.stringify({
        event: "reminders_sent",
        today,
        sent: result.sent,
        failed: result.failed.length,
      }),
    );
    if (result.failed.length > 0) {
      console.error(JSON.stringify({ event: "reminders_failed", ...result }));
    }
  }
} finally {
  await closeDb();
}
