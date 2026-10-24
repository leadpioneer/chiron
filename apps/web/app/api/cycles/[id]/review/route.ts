import { NextResponse } from "next/server";
import { cycleReviewSchema } from "@chiron/contracts";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import {
  reviewCycle,
  CycleReviewError,
} from "@/src/lib/cycle-review-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  const { id } = await context.params;

  const parsed = await readJson(request, cycleReviewSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await reviewCycle(user.id, id, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CycleReviewError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("CYCLE_REVIEW_FAILED", "Не удалось пересмотреть цикл", 500);
  }
}
