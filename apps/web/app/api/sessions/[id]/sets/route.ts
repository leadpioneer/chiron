import { NextResponse } from "next/server";
import { setPerformanceSchema } from "@chiron/contracts";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError, readJson } from "@/src/lib/api";
import {
  deleteSet,
  upsertSet,
  SessionError,
} from "@/src/lib/session-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;
  const { id } = await context.params;

  const parsed = await readJson(request, setPerformanceSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const row = await upsertSet(
      subjectContext.subject.id,
      id,
      parsed.data,
      subjectContext.viewer.id,
    );
    return NextResponse.json({ ok: true, set: row });
  } catch (error) {
    if (error instanceof SessionError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("SET_FAILED", "Не удалось сохранить подход", 500);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;
  const { id } = await context.params;

  const clientSetId = new URL(request.url).searchParams.get("clientSetId");
  if (
    !clientSetId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      clientSetId,
    )
  ) {
    return apiError("BAD_REQUEST", "Некорректный идентификатор подхода", 422);
  }

  try {
    await deleteSet(
      subjectContext.subject.id,
      id,
      clientSetId,
      subjectContext.viewer.id,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SessionError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("SET_DELETE_FAILED", "Не удалось удалить подход", 500);
  }
}
