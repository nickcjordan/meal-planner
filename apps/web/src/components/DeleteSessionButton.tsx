"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, ApiError } from "@/lib/api";

/** Danger action on the history detail page: permanently removes a planning
 *  session (and its feedback + shopping snapshot). Recipe cook-history is kept. */
export function DeleteSessionButton({ sessionId, weekLabel }: { sessionId: string; weekLabel: string }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleDelete() {
    setDeleting(true);
    try {
      await api(`/api/sessions/${sessionId}`, { method: "DELETE" });
      toast(`Deleted the plan for ${weekLabel}`);
      router.push("/settings/history");
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to delete the plan", "error");
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Button variant="danger" size="sm" loading={deleting} onClick={() => setConfirming(true)}>
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Delete this plan?"
        message={`The plan for ${weekLabel}, its feedback, and its shopping snapshot will be permanently removed. Recipe cook history is kept.`}
        confirmLabel="Delete plan"
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
