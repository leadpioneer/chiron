import { NextResponse } from "next/server";
import { setPerformanceSchema } from "@chiron/contracts";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import { upsertSet, SessionError } from "@/src/lib/session-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  const { id } = await context.params;

  const parsed = await readJson(request, setPerformanceSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const row = await upsertSet(user.id, id, parsed.data);
    return NextResponse.json({ ok: true, set: row });
  } catch (error) {
    if (error instanceof SessionError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("SET_FAILED", "Не удалось сохранить подход", 500);
  }
}
