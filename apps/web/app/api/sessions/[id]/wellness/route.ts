import { NextResponse } from "next/server";
import { wellnessSchema } from "@chiron/contracts";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import { saveWellness, SessionError } from "@/src/lib/session-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  const { id } = await context.params;

  const parsed = await readJson(request, wellnessSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await saveWellness(user.id, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SessionError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("WELLNESS_FAILED", "Не удалось сохранить состояние", 500);
  }
}
