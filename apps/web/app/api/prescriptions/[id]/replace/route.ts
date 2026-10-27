import { NextResponse } from "next/server";
import { replaceExerciseSchema } from "@chiron/contracts";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError, readJson } from "@/src/lib/api";
import {
  PlanEditError,
  replacePrescriptionExercise,
} from "@/src/lib/plan-edit-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;
  const { id } = await context.params;

  const parsed = await readJson(request, replaceExerciseSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await replacePrescriptionExercise(
      subjectContext.subject.id,
      id,
      parsed.data,
      subjectContext.viewer.id,
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
