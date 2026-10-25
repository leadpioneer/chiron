import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError } from "@/src/lib/api";
import { MenteeError, revokeMentee } from "@/src/lib/mentee-service";
import {
  clearSubjectCookie,
  SUBJECT_COOKIE,
} from "@/src/lib/subject";

function isFormRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const viewer = await getCurrentUser();
  if (!viewer) {
    if (isFormRequest(request)) {
      return NextResponse.redirect(new URL("/login", request.url), 303);
    }
    return apiError("UNAUTHORIZED", "Требуется вход", 401);
  }
  const { id } = await context.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    return apiError("NOT_FOUND", "Связь с подопечным не найдена", 404);
  }

  try {
    await revokeMentee(viewer.id, id);
    const store = await cookies();
    if (store.get(SUBJECT_COOKIE)?.value === id) {
      await clearSubjectCookie();
    }
    return isFormRequest(request)
      ? NextResponse.redirect(new URL("/mentees", request.url), 303)
      : NextResponse.json({ ok: true });
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
    return apiError("MENTEE_REVOKE_FAILED", "Не удалось убрать доступ", 500);
  }
}
