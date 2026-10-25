import { NextResponse } from "next/server";
import { replaceExerciseSchema } from "@chiron/contracts";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import {
  PlanEditError,
  replacePrescriptionExercise,
} from "@/src/lib/plan-edit-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  const { id } = await context.params;

  const parsed = await readJson(request, replaceExerciseSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await replacePrescriptionExercise(
      user.id,
      id,
      parsed.data.variantId,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PlanEditError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError(
      "EXERCISE_REPLACE_FAILED",
      "Не удалось заменить упражнение",
      500,
    );
  }
}
