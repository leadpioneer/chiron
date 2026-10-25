import { NextResponse } from "next/server";
import { wellnessSchema } from "@chiron/contracts";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError, readJson } from "@/src/lib/api";
import { saveWellness, SessionError } from "@/src/lib/session-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;
  const { id } = await context.params;

  const parsed = await readJson(request, wellnessSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await saveWellness(
      subjectContext.subject.id,
      id,
      parsed.data,
      subjectContext.viewer.id,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SessionError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("WELLNESS_FAILED", "Не удалось сохранить состояние", 500);
  }
}
