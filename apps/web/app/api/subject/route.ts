import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { coachMentees, getDb } from "@chiron/db";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError } from "@/src/lib/api";
import {
  clearSubjectCookie,
  setSubjectCookie,
} from "@/src/lib/subject";

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

  let menteeUserId = "";
  if (isFormRequest(request)) {
    const form = await request.formData();
    menteeUserId = String(form.get("menteeUserId") ?? "").trim();
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_JSON", "Некорректный JSON", 400);
    }
    if (body && typeof body === "object" && "menteeUserId" in body) {
      menteeUserId = String(
        (body as { menteeUserId?: unknown }).menteeUserId ?? "",
      ).trim();
    }
  }

  if (menteeUserId === "" || menteeUserId === viewer.id) {
    await clearSubjectCookie();
    return isFormRequest(request)
      ? NextResponse.redirect(new URL("/today", request.url), 303)
      : NextResponse.json({ ok: true, subject: "self" });
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      menteeUserId,
    )
  ) {
    await clearSubjectCookie();
    return isFormRequest(request)
      ? NextResponse.redirect(
          new URL("/mentees?error=access", request.url),
          303,
        )
      : apiError("SUBJECT_FORBIDDEN", "Нет доступа к этому дневнику", 403);
  }

  const rows = await getDb()
    .select({ id: coachMentees.id })
    .from(coachMentees)
    .where(
      and(
        eq(coachMentees.coachUserId, viewer.id),
        eq(coachMentees.menteeUserId, menteeUserId),
        eq(coachMentees.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    await clearSubjectCookie();
    return isFormRequest(request)
      ? NextResponse.redirect(
          new URL("/mentees?error=access", request.url),
          303,
        )
      : apiError("SUBJECT_FORBIDDEN", "Нет доступа к этому дневнику", 403);
  }

  await setSubjectCookie(menteeUserId);
  return isFormRequest(request)
    ? NextResponse.redirect(new URL("/today", request.url), 303)
    : NextResponse.json({ ok: true, subject: menteeUserId });
}
