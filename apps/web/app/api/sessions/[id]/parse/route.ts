import { NextResponse } from "next/server";
import { parseTextSchema } from "@chiron/contracts";
import {
  assessSafety,
  mergeSafetyAssessments,
  type SafetyAssessment,
} from "@chiron/core";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError, readJson } from "@/src/lib/api";
import { parseTextForUser } from "@/src/lib/llm";

export async function POST(
  request: Request,
  _context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const subjectContext = await subjectContextForApi();
  if (subjectContext instanceof NextResponse) return subjectContext;
  const readOnly = readOnlyResponse(subjectContext);
  if (readOnly) return readOnly;

  const parsed = await readJson(request, parseTextSchema);
  if (!parsed.ok) return parsed.response;

  const response = await parseTextForUser(
    subjectContext.subject.id,
    parsed.data.text,
  );
  const observations = response.safetyObservations;
  const llmLabel = observations.some((item) => item.code === "RED")
    ? "RED"
    : observations.some((item) => item.code === "YELLOW_ILLNESS")
      ? "YELLOW_ILLNESS"
      : observations.some((item) => item.code === "YELLOW_PAIN")
        ? "YELLOW_PAIN"
        : observations.some((item) => item.code === "YELLOW_SYSTEMIC")
          ? "YELLOW_SYSTEMIC"
          : "GREEN";
  const llmSafety: SafetyAssessment = {
    label: llmLabel,
    reasons: observations.map((item) => item.quote),
    blockProgression: llmLabel !== "GREEN",
    pause: llmLabel === "RED",
    escalate: llmLabel === "RED",
  };
  const safety = mergeSafetyAssessments(
    assessSafety({ text: parsed.data.text }),
    llmSafety,
  );

  return NextResponse.json({
    ok: true,
    parsed: response,
    safety,
  });
}
