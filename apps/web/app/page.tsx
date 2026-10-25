import { redirect } from "next/navigation";
import { requireSubject } from "@/src/lib/subject";
import { getActiveCycle } from "@/src/lib/plan-service";

export default async function HomePage() {
  const { subject } = await requireSubject();
  const cycle = await getActiveCycle(subject.id);
  redirect(cycle ? "/today" : "/onboarding");
}
