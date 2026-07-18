"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlanningWizard } from "@/components/wizard/PlanningWizard";
import { getPlanningMonday } from "@/lib/week";

function WizardPageContent() {
  const searchParams = useSearchParams();
  const weekOf = searchParams.get("week") ?? getPlanningMonday();
  return <PlanningWizard weekOf={weekOf} />;
}

export default function PlanWizardPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-muted">Loading…</div>}>
      <WizardPageContent />
    </Suspense>
  );
}
