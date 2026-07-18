"use client";

import { useState } from "react";
import { Home, RotateCcw } from "lucide-react";
import { Modal, Button } from "@/components/ui";

export type ListTarget = "pantry" | "staples";

interface AddToListModalProps {
  ingredientName: string;
  target: ListTarget;
  suggestedCategory?: string;
  onConfirm: () => void;
  onClose: () => void;
}

const LIST_INFO: Record<
  ListTarget,
  {
    icon: typeof Home;
    label: string;
    color: string;
    description: string;
    bullets: string[];
  }
> = {
  pantry: {
    icon: Home,
    label: "Pantry",
    color: "text-success",
    description: "Items you always keep stocked at home.",
    bullets: [
      "Won't appear on shopping lists",
      "AI assumes you have it when planning meals",
    ],
  },
  staples: {
    icon: RotateCcw,
    label: "Weekly Staple",
    color: "text-accent",
    description: "Items you buy regularly every week.",
    bullets: [
      "Automatically added to every shopping list",
      "AI includes it when estimating your weekly grocery run",
    ],
  },
};

export function AddToListModal({
  ingredientName,
  target,
  suggestedCategory,
  onConfirm,
  onClose,
}: AddToListModalProps) {
  const [adding, setAdding] = useState(false);
  const info = LIST_INFO[target];
  const Icon = info.icon;

  async function handleConfirm() {
    setAdding(true);
    try {
      await onConfirm();
    } finally {
      setAdding(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" ariaLabel={`Add ${ingredientName} to ${info.label}`}>
      <div className="flex items-center gap-2.5">
        <div className={`rounded-lg bg-tag-bg p-2 ${info.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Add to {info.label}?</h3>
          <p className="text-sm font-medium text-foreground">{ingredientName}</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted">{info.description}</p>

      <ul className="mt-3 space-y-1.5">
        {info.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted">
            <span className="mt-0.5 text-xs">•</span>
            {bullet}
          </li>
        ))}
      </ul>

      {suggestedCategory && (
        <p className="mt-3 text-xs text-muted">
          Category:{" "}
          <span className="font-medium text-foreground">
            {suggestedCategory.charAt(0).toUpperCase() + suggestedCategory.slice(1)}
          </span>{" "}
          (auto-detected)
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} loading={adding}>
          {!adding && <Icon className="h-4 w-4" />}
          Add to {info.label}
        </Button>
      </div>
    </Modal>
  );
}
