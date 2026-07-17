"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PlanningChat } from "@/components/PlanningChat";
import { getPlanningMonday } from "@/lib/week";

function PlanPageContent() {
  const searchParams = useSearchParams();
  const weekOf = searchParams.get("week") ?? getPlanningMonday();

  return <PlanningChat weekOf={weekOf} />;
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-muted">Loading...</div>}>
      <PlanPageContent />
    </Suspense>
  );
}
