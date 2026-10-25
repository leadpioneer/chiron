import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const { telegramApi } = await import("../apps/web/src/lib/telegram-api");

const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not set");
const offsetFile =
  process.env.TELEGRAM_OFFSET_FILE ?? "/opt/chiron/telegram-offset";

let offset = 0;
try {
  offset = Number((await readFile(offsetFile, "utf8")).trim()) || 0;
} catch {
  offset = 0;
}

let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await telegramApi("deleteWebhook", { drop_pending_updates: false });
console.info(JSON.stringify({ event: "telegram_poll_started", offset }));

while (!stopped) {
  try {
    const updates = await telegramApi<Array<{ update_id: number }>>(
      "getUpdates",
      {
        offset,
        timeout: 0,
        allowed_updates: ["callback_query"],
      },
    );
    if (updates.length > 0) {
      console.info(
        JSON.stringify({
          event: "telegram_updates",
          count: updates.length,
          offset,
        }),
      );
    }

    for (const update of updates) {
      const response = await fetch(
        "http://127.0.0.1:3000/api/telegram/webhook",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-telegram-bot-api-secret-token": secret,
          },
          body: JSON.stringify(update),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!response.ok) {
        console.error(
          JSON.stringify({
            event: "telegram_poll_forward_failed",
            status: response.status,
          }),
        );
        break;
      }
      offset = update.update_id + 1;
      await writeFile(offsetFile, String(offset));
      console.info(
        JSON.stringify({
          event: "telegram_update_forwarded",
          updateId: update.update_id,
        }),
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "telegram_poll_error",
        reason: error instanceof Error ? error.message : "unknown",
      }),
    );
    await sleep(5000);
    continue;
  }

  await sleep(2000);
}

console.info(JSON.stringify({ event: "telegram_poll_stopped" }));
