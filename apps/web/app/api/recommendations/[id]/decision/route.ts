import { NextResponse } from "next/server";
import { decisionSchema } from "@chiron/contracts";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import {
  applyDecision,
  RecommendationError,
} from "@/src/lib/recommendation-service";

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  ALREADY_DECIDED: 409,
  EXPIRED: 409,
  CYCLE_CLOSED: 409,
  SAFETY_LOCKED: 422,
  EDIT_OUT_OF_BOUNDS: 422,
  EDIT_OUT_OF_SCOPE: 422,
  NO_PLAN_VERSION: 409,
  BROKEN_PLAN: 500,
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  const { id } = await context.params;

  const parsed = await readJson(request, decisionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await applyDecision({
      userId: user.id,
      recommendationId: id,
      decision: parsed.data,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RecommendationError) {
      return apiError(
        error.code,
        error.message,
        STATUS_BY_CODE[error.code] ?? 400,
      );
    }
    console.error(error);
    return apiError("DECISION_FAILED", "Не удалось сохранить решение", 500);
  }
}
