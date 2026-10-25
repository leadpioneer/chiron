import { NextResponse } from "next/server";
import { clearSession } from "@/src/lib/auth";
import { clearSubjectCookie } from "@/src/lib/subject";

export async function POST(): Promise<NextResponse> {
  await clearSession();
  await clearSubjectCookie();
  return NextResponse.json({ ok: true });
}
