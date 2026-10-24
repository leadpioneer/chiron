import { NextResponse } from "next/server";
import { telegramWidgetAuthSchema } from "@chiron/contracts";
import { createSession } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import {
  clientIp,
  rateLimitResponse,
  telegramIpLimiter,
} from "@/src/lib/security";
import { authenticateTelegramUser } from "@/src/lib/telegram-auth";
import { verifyTelegramLogin } from "@/src/lib/telegram";

export async function POST(request: Request): Promise<Response> {
  const limit = telegramIpLimiter.check(`telegram-widget:${clientIp(request)}`);
  if (!limit.ok) return rateLimitResponse(limit);

  const parsed = await readJson(request, telegramWidgetAuthSchema);
  if (!parsed.ok) return parsed.response;

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const verification = verifyTelegramLogin(parsed.data.params, botToken);
  if (!verification.ok || !verification.user) {
    return apiError(
      "TELEGRAM_AUTH_FAILED",
      verification.reason ?? "Не удалось проверить Telegram",
      401,
    );
  }

  const outcome = await authenticateTelegramUser(verification.user);
  if (!outcome.ok) {
    return apiError(outcome.code, outcome.message, outcome.status);
  }

  await createSession(outcome.userId);
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
