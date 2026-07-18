"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { tryApi } from "@/lib/api";
import { useToast } from "@/components/Toast";

export function RecipeEnhanceButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function handleEnhance() {
    setLoading(true);
    // tryApi never throws — a network/transport failure surfaces as an error
    // toast instead of spinning the button forever.
    const res = await tryApi(`/api/recipes/${recipeId}/enhance`, { method: "POST" });
    setLoading(false);

    if (!res.ok) {
      toast(res.error.message || "Enhancement failed", "error");
      return;
    }

    toast("Recipe enhanced", "success");
    startTransition(() => router.refresh());
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleEnhance} loading={loading}>
      {!loading && <Sparkles className="h-3.5 w-3.5" />}
      {loading ? "Enhancing…" : "Enhance"}
    </Button>
  );
}
