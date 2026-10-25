import { NextResponse } from "next/server";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError } from "@/src/lib/api";
import { reopenSession, SessionError } from "@/src/lib/session-service";

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
    await reopenSession(
      subjectContext.subject.id,
      id,
      subjectContext.viewer.id,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SessionError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("REOPEN_FAILED", "Не удалось вернуть тренировку в работу", 500);
  }
}
