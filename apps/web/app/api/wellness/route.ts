import { NextResponse } from "next/server";
import { wellnessSchema } from "@chiron/contracts";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError, readJson } from "@/src/lib/api";
import { saveWeeklyWellness } from "@/src/lib/session-service";

export async function POST(request: Request): Promise<NextResponse> {
  const context = await subjectContextForApi();
  if (context instanceof NextResponse) return context;
  const readOnly = readOnlyResponse(context);
  if (readOnly) return readOnly;

  const parsed = await readJson(request, wellnessSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await saveWeeklyWellness(context.subject.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return apiError("WELLNESS_FAILED", "Не удалось сохранить чек-ин", 500);
  }
}
