import { NextResponse } from "next/server";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError } from "@/src/lib/api";
import {
  SessionError,
  skipSessionExercise,
} from "@/src/lib/session-service";

function isFormRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; prescriptionId: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;
  const { id, prescriptionId } = await context.params;

  try {
    await skipSessionExercise(
      subjectContext.subject.id,
      id,
      prescriptionId,
      subjectContext.viewer.id,
    );
    return isFormRequest(request)
      ? NextResponse.redirect(new URL(`/sessions/${id}`, request.url), 303)
      : NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SessionError) {
      if (isFormRequest(request)) {
        return NextResponse.redirect(
          new URL(`/sessions/${id}?error=${error.code.toLowerCase()}`, request.url),
          303,
        );
      }
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("EXERCISE_SKIP_FAILED", "Не удалось убрать упражнение", 500);
  }
}
