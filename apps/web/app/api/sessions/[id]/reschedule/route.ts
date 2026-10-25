import { NextResponse } from "next/server";
import { rescheduleSessionSchema } from "@chiron/contracts";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError, readJson } from "@/src/lib/api";
import {
  rescheduleSession,
  RescheduleError,
} from "@/src/lib/reschedule-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;
  const { id } = await context.params;

  const parsed = await readJson(request, rescheduleSessionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await rescheduleSession(
      subjectContext.subject.id,
      id,
      parsed.data,
      { actorUserId: subjectContext.viewer.id },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RescheduleError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("RESCHEDULE_FAILED", "Не удалось перенести тренировку", 500);
  }
}
