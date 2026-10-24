import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth";
import { getActiveCycle } from "@/src/lib/plan-service";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const cycle = await getActiveCycle(user.id);
  redirect(cycle ? "/today" : "/onboarding");
}
