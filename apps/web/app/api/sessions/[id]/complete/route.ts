import { NextResponse } from "next/server";
import { completeSessionSchema } from "@chiron/contracts";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import {
  createSessionRecommendations,
  RecommendationError,
} from "@/src/lib/recommendation-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  const { id } = await context.params;

  const parsed = await readJson(request, completeSessionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const recommendations = await createSessionRecommendations({
      userId: user.id,
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
