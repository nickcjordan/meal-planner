"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PlanningChat } from "@/components/PlanningChat";

function getNextMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  return monday.toISOString().split("T")[0];
}

function PlanPageContent() {
  const searchParams = useSearchParams();
  const weekOf = searchParams.get("week") ?? getNextMonday();

  return <PlanningChat weekOf={weekOf} />;
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-muted">Loading...</div>}>
      <PlanPageContent />
    </Suspense>
  );
}
