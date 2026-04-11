"use client";

import { useState, useEffect } from "react";
import type { PlanningSession } from "@meal-planner/types";
import { SessionCard } from "@/components/SessionCard";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<PlanningSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sessions?limit=20")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSessions(data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-16 text-center text-muted">Loading history...</div>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Meal Plan History</h1>
      {sessions.length === 0 ? (
        <p className="py-12 text-center text-muted">
          No planning sessions yet. Start one from the Plan page.
        </p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
