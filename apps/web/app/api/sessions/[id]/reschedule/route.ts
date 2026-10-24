import { NextResponse } from "next/server";
import { rescheduleSessionSchema } from "@chiron/contracts";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import {
  rescheduleSession,
  RescheduleError,
} from "@/src/lib/reschedule-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  const { id } = await context.params;

  const parsed = await readJson(request, rescheduleSessionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await rescheduleSession(user.id, id, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RescheduleError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("RESCHEDULE_FAILED", "Не удалось перенести тренировку", 500);
  }
}
