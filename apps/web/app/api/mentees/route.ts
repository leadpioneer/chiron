import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError } from "@/src/lib/api";
import {
  createManagedMentee,
  listMentees,
  MenteeError,
} from "@/src/lib/mentee-service";
import { setSubjectCookie } from "@/src/lib/subject";

function isFormRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

export async function GET(): Promise<NextResponse> {
  const viewer = await getCurrentUser();
  if (!viewer) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  return NextResponse.json({ mentees: await listMentees(viewer.id) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const viewer = await getCurrentUser();
  if (!viewer) {
    if (isFormRequest(request)) {
      return NextResponse.redirect(new URL("/login", request.url), 303);
    }
    return apiError("UNAUTHORIZED", "Требуется вход", 401);
  }

  let displayName = "";
  let telegramId: string | null = null;
  if (isFormRequest(request)) {
    const form = await request.formData();
    displayName = String(form.get("displayName") ?? "");
    const rawTelegramId = String(form.get("telegramId") ?? "").trim();
    telegramId = rawTelegramId === "" ? null : rawTelegramId;
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_JSON", "Некорректный JSON", 400);
    }
    if (body && typeof body === "object") {
      const record = body as {
        displayName?: unknown;
        telegramId?: unknown;
      };
      displayName = String(record.displayName ?? "");
      telegramId =
        record.telegramId === undefined || record.telegramId === null
          ? null
          : String(record.telegramId).trim() || null;
    }
  }

  try {
    const mentee = await createManagedMentee(
      viewer.id,
      displayName,
      telegramId,
    );
    await setSubjectCookie(mentee.id);
    return isFormRequest(request)
      ? NextResponse.redirect(new URL("/onboarding", request.url), 303)
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
    return apiError("MENTEE_CREATE_FAILED", "Не удалось создать профиль", 500);
  }
}
