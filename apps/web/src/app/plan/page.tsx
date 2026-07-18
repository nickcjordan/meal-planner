"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlanningWizard } from "@/components/wizard/PlanningWizard";
import { getPlanningMonday } from "@/lib/week";

function PlanPageContent() {
  const searchParams = useSearchParams();
  const weekOf = searchParams.get("week") ?? getPlanningMonday();
  // key: a ?week= change fully remounts the wizard — its restore/persist state
  // machine is per-week and must never mix weeks (Codex review, Med).
  return <PlanningWizard key={weekOf} weekOf={weekOf} />;
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-muted">Loading…</div>}>
      <PlanPageContent />
    </Suspense>
  );
}
