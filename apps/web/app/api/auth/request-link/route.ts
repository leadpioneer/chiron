import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { loginRequestSchema } from "@chiron/contracts";
import { getDb, magicLinks } from "@chiron/db";
import { apiError, readJson } from "@/src/lib/api";

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = await readJson(request, loginRequestSchema);
  if (!parsed.ok) return parsed.response;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

  await getDb().insert(magicLinks).values({
    email: parsed.data.email,
    tokenHash,
    expiresAt,
  });

  const devMode =
    process.env.AUTH_DEV_MODE === "1" ||
    process.env.NODE_ENV !== "production";

  if (!devMode && !process.env.EMAIL_WEBHOOK_URL) {
    return apiError(
      "EMAIL_NOT_CONFIGURED",
      "Отправка почты не настроена. Обратитесь к администратору.",
      503,
    );
  }

  if (process.env.EMAIL_WEBHOOK_URL) {
    try {
      const emailResponse = await fetch(process.env.EMAIL_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: parsed.data.email, url: link }),
        signal: AbortSignal.timeout(5000),
      });
      if (!emailResponse.ok) throw new Error(`Email HTTP ${emailResponse.status}`);
    } catch (error) {
      console.error("Magic link email failed", error);
      return apiError(
        "EMAIL_FAILED",
        "Не удалось отправить ссылку. Попробуйте ещё раз.",
        502,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message: "Ссылка для входа создана.",
    ...(devMode ? { devLink: link } : {}),
  });
}
