"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { tryApi } from "@/lib/api";
import { useToast } from "@/components/Toast";

export function DeleteRecipeButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await tryApi(`/api/recipes/${recipeId}`, { method: "DELETE" });
    if (res.ok) {
      toast("Recipe deleted", "success");
      router.push("/recipes");
    } else {
      setDeleting(false);
      toast(res.error.message || "Couldn't delete recipe", "error");
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Delete this recipe?</span>
        <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
          Yes, delete
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={deleting}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setConfirming(true)}
      className="hover:border-danger/50 hover:text-danger"
    >
      <Trash2 className="h-3.5 w-3.5" /> Delete
    </Button>
  );
}
