"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarClock, AlertTriangle } from "lucide-react";
import type { PlanningSession } from "@meal-planner/types";
import { SessionCard } from "@/components/SessionCard";
import { PageHeader, EmptyState, Button, ListSkeleton } from "@/components/ui";
import { tryApi, type ApiResult } from "@/lib/api";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<PlanningSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // setState lives in the .then continuation (not the synchronous effect body)
  // so the mount fetch doesn't trigger cascading renders.
  const applyResult = useCallback((res: ApiResult<PlanningSession[]>) => {
    if (res.ok) {
      setSessions(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } else {
      setError(res.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void tryApi<PlanningSession[]>("/api/sessions?limit=20").then((res) => {
      if (active) applyResult(res);
    });
    return () => {
      active = false;
    };
  }, [applyResult]);

  function retry() {
    setLoading(true);
    setError(null);
    void tryApi<PlanningSession[]>("/api/sessions?limit=20").then(applyResult);
  }

  return (
    <div>
      <PageHeader title="Meal Plan History" className="mb-6" />

      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load your history"
          description={error}
          action={
            <Button variant="secondary" onClick={retry}>
              Retry
            </Button>
          }
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No planning sessions yet"
          description="Plans you confirm will show up here. Start one from the Plan page."
        />
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
