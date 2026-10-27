import { NextResponse } from "next/server";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError } from "@/src/lib/api";
import { PlanEditError } from "@/src/lib/plan-edit-service";
import { removePrescriptionFromPlan } from "@/src/lib/plan-structure-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; prescriptionId: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;
  const { id, prescriptionId } = await context.params;

  try {
    const result = await removePrescriptionFromPlan(
      subjectContext.subject.id,
      id,
      prescriptionId,
      subjectContext.viewer.id,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PlanEditError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError(
      "EXERCISE_REMOVE_FAILED",
      "Не удалось удалить упражнение",
      500,
    );
  }
}
