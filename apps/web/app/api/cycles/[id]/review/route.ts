import { NextResponse } from "next/server";
import { cycleReviewSchema } from "@chiron/contracts";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError, readJson } from "@/src/lib/api";
import {
  reviewCycle,
  CycleReviewError,
} from "@/src/lib/cycle-review-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;
  const { id } = await context.params;

  const parsed = await readJson(request, cycleReviewSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await reviewCycle(
      subjectContext.subject.id,
      id,
      parsed.data,
      { actorUserId: subjectContext.viewer.id },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CycleReviewError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("CYCLE_REVIEW_FAILED", "Не удалось пересмотреть цикл", 500);
  }
}
