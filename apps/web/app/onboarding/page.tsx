import { redirect } from "next/navigation";
import { V1_TEMPLATE } from "@chiron/core";
import { requireSubject } from "@/src/lib/subject";
import { getActiveCycle } from "@/src/lib/plan-service";
import { OnboardingWizard } from "@/src/components/OnboardingWizard";

export const metadata = { title: "Настройка цикла" };

export default async function OnboardingPage() {
  const { subject } = await requireSubject();
  const cycle = await getActiveCycle(subject.id);
  if (cycle) redirect("/today");

  return (
    <OnboardingWizard template={V1_TEMPLATE} userName={subject.displayName} />
  );
}
