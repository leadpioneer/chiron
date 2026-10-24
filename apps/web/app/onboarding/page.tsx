import { redirect } from "next/navigation";
import { V1_TEMPLATE } from "@chiron/core";
import { getCurrentUser } from "@/src/lib/auth";
import { getActiveCycle } from "@/src/lib/plan-service";
import { OnboardingWizard } from "@/src/components/OnboardingWizard";

export const metadata = { title: "Настройка цикла" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const cycle = await getActiveCycle(user.id);
  if (cycle) redirect("/today");

  return (
    <OnboardingWizard template={V1_TEMPLATE} userName={user.displayName} />
  );
}
