import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError } from "@/src/lib/api";
import {
  linkExistingMenteeByTelegramId,
  MenteeError,
} from "@/src/lib/mentee-service";

function isFormRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const viewer = await getCurrentUser();
  if (!viewer) {
    if (isFormRequest(request)) {
      return NextResponse.redirect(new URL("/login", request.url), 303);
    }
    return apiError("UNAUTHORIZED", "Требуется вход", 401);
  }

  let telegramId = "";
  if (isFormRequest(request)) {
    const form = await request.formData();
    telegramId = String(form.get("telegramId") ?? "");
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_JSON", "Некорректный JSON", 400);
    }
    if (body && typeof body === "object" && "telegramId" in body) {
      telegramId = String((body as { telegramId?: unknown }).telegramId ?? "");
    }
  }

  try {
    const mentee = await linkExistingMenteeByTelegramId(
      viewer.id,
      telegramId,
    );
    return isFormRequest(request)
      ? NextResponse.redirect(new URL("/mentees", request.url), 303)
      : NextResponse.json({ ok: true, mentee });
  } catch (error) {
    if (error instanceof MenteeError) {
      if (isFormRequest(request)) {
        return NextResponse.redirect(
          new URL(`/mentees?error=${error.code.toLowerCase()}`, request.url),
          303,
        );
      }
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("MENTEE_LINK_FAILED", "Не удалось связать профиль", 500);
  }
}
