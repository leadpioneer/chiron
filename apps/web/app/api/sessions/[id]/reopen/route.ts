import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError } from "@/src/lib/api";
import { reopenSession, SessionError } from "@/src/lib/session-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  const { id } = await context.params;

  try {
    await reopenSession(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SessionError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("REOPEN_FAILED", "Не удалось вернуть тренировку в работу", 500);
  }
}
