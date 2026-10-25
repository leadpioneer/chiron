import { NextResponse } from "next/server";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError } from "@/src/lib/api";
import { prepareReturn, ReturnError } from "@/src/lib/return-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;
  const { id } = await context.params;

  try {
    const result = await prepareReturn(
      subjectContext.subject.id,
      id,
      { actorUserId: subjectContext.viewer.id },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ReturnError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("RETURN_FAILED", "Не удалось подготовить возвращение", 500);
  }
}
