import { NextResponse } from "next/server";
import { completeSessionSchema } from "@chiron/contracts";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError, readJson } from "@/src/lib/api";
import {
  createSessionRecommendations,
  RecommendationError,
} from "@/src/lib/recommendation-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;
  const { id } = await context.params;

  const parsed = await readJson(request, completeSessionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const recommendations = await createSessionRecommendations({
      userId: subjectContext.subject.id,
      actorUserId: subjectContext.viewer.id,
      sessionId: id,
      sessionRpe: parsed.data.sessionRpe,
      comment: parsed.data.comment ?? null,
      actualDate: parsed.data.actualDate,
    });
    return NextResponse.json({
      ok: true,
      recommendations: recommendations.map((item) => ({
        id: item.id,
        action: item.action,
        scopeType: item.scopeType,
        explanation: item.explanation,
      })),
    });
  } catch (error) {
    if (error instanceof RecommendationError) {
      return apiError(error.code, error.message, 400);
    }
    console.error(error);
    return apiError("COMPLETE_FAILED", "Не удалось завершить тренировку", 500);
  }
}
