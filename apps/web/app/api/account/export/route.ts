import { NextResponse } from "next/server";
import { subjectContextForApi } from "@/src/lib/subject";
import { exportUserData } from "@/src/lib/export-service";

export async function GET(): Promise<NextResponse> {
  const context = await subjectContextForApi();
  if (context instanceof NextResponse) return context;

  const data = await exportUserData(context.subject.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="chiron-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
