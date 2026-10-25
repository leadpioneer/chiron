import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { coachMentees, getDb, users } from "@chiron/db";
import { apiError } from "./api";
import { getCurrentUser, type SessionUser } from "./auth";

export const SUBJECT_COOKIE = "chiron_subject";
const SUBJECT_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SubjectAccessError extends Error {
  constructor(message = "Нет доступа к дневнику подопечного") {
    super(message);
    this.name = "SubjectAccessError";
  }
}

export interface SubjectContext {
  viewer: SessionUser;
  subject: SessionUser;
  isSelf: boolean;
  canWrite: boolean;
}

async function resolveSubject(viewer: SessionUser): Promise<SubjectContext> {
  const store = await cookies();
  const subjectId = store.get(SUBJECT_COOKIE)?.value;
  if (!subjectId || subjectId === viewer.id) {
    return { viewer, subject: viewer, isSelf: true, canWrite: true };
  }
  if (!UUID_RE.test(subjectId)) {
    throw new SubjectAccessError();
  }

  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      locale: users.locale,
      permissions: coachMentees.permissions,
    })
    .from(coachMentees)
    .innerJoin(users, eq(users.id, coachMentees.menteeUserId))
    .where(
      and(
        eq(coachMentees.coachUserId, viewer.id),
        eq(coachMentees.menteeUserId, subjectId),
        eq(coachMentees.status, "ACTIVE"),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new SubjectAccessError();

  return {
    viewer,
    subject: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      locale: row.locale,
    },
    isSelf: false,
    canWrite: row.permissions !== "READ",
  };
}

export async function setSubjectCookie(menteeUserId: string): Promise<void> {
  const store = await cookies();
  store.set(SUBJECT_COOKIE, menteeUserId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SUBJECT_COOKIE_MAX_AGE,
  });
}

export async function clearSubjectCookie(): Promise<void> {
  (await cookies()).delete(SUBJECT_COOKIE);
}

export async function getSubjectContext(): Promise<SubjectContext | null> {
  const viewer = await getCurrentUser();
  if (!viewer) return null;
  try {
    return await resolveSubject(viewer);
  } catch (error) {
    if (error instanceof SubjectAccessError) return null;
    throw error;
  }
}

export async function requireSubject(): Promise<SubjectContext> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  try {
    return await resolveSubject(viewer);
  } catch (error) {
    if (error instanceof SubjectAccessError) {
      redirect("/mentees?error=access");
    }
    throw error;
  }
}

export async function subjectContextForApi(): Promise<
  SubjectContext | NextResponse
> {
  const viewer = await getCurrentUser();
  if (!viewer) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  try {
    return await resolveSubject(viewer);
  } catch (error) {
    if (error instanceof SubjectAccessError) {
      await clearSubjectCookie();
      return apiError(
        "SUBJECT_FORBIDDEN",
        "Нет доступа к этому дневнику",
        403,
      );
    }
    throw error;
  }
}

export function readOnlyResponse(
  context: SubjectContext,
): NextResponse | null {
  if (context.canWrite) return null;
  return apiError(
    "READ_ONLY",
    "Доступ к этому дневнику только для чтения",
    403,
  );
}
