import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { loginRequestSchema } from "@chiron/contracts";
import {
  cleanupOldMagicLinks,
  getDb,
  magicLinks,
  users,
} from "@chiron/db";
import { apiError, readJson } from "@/src/lib/api";
import {
  authDevModeEnabled,
  emailAllowedForSignup,
  emailProvider,
} from "@/src/lib/config";
import { sendMagicLinkEmail } from "@/src/lib/email";
import { magicLinkEmailLimit } from "@/src/lib/auth-rate-limit";
import {
  authIpLimiter,
  clientIp,
  rateLimitResponse,
} from "@/src/lib/security";

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJson(request, loginRequestSchema);
  if (!parsed.ok) return parsed.response;

  const ipLimit = authIpLimiter.check(`magic-link:${clientIp(request)}`);
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const email = parsed.data.email;
  const emailLimit = await magicLinkEmailLimit(email);
  if (!emailLimit.ok) return rateLimitResponse(emailLimit);

  const existing = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  if (!existing[0] && !emailAllowedForSignup(email)) {
    return apiError(
      "EMAIL_NOT_ALLOWED",
      "Доступ по приглашению. Обратитесь к администратору.",
      403,
    );
  }

  const devMode = authDevModeEnabled();
  const provider = emailProvider();
  if (!devMode && (provider === "none" || provider === "console")) {
    return apiError(
      "EMAIL_NOT_CONFIGURED",
      "Отправка почты не настроена. Обратитесь к администратору.",
      503,
    );
  }

  await cleanupOldMagicLinks();

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

  const inserted = await getDb()
    .insert(magicLinks)
    .values({ email, tokenHash, expiresAt })
    .returning({ id: magicLinks.id });
  const magicLinkId = inserted[0]?.id;

  const delivery = await sendMagicLinkEmail(email, link);
  if (!delivery.ok) {
    if (magicLinkId) {
      await getDb().delete(magicLinks).where(eq(magicLinks.id, magicLinkId));
    }
    return apiError(
      delivery.code === "EMAIL_NOT_CONFIGURED"
        ? "EMAIL_NOT_CONFIGURED"
        : "EMAIL_FAILED",
      delivery.code === "EMAIL_NOT_CONFIGURED"
        ? "Отправка почты не настроена. Обратитесь к администратору."
        : "Не удалось отправить ссылку. Попробуйте ещё раз.",
      delivery.code === "EMAIL_NOT_CONFIGURED" ? 503 : 502,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message: "Ссылка для входа создана.",
      ...(devMode ? { devLink: link } : {}),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
