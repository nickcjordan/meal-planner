"use client";

import { Star } from "lucide-react";
import { useState } from "react";

interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
}

export function StarRating({ value, onChange, readonly = false }: StarRatingProps) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hover || value);
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => !readonly && setHover(star)}
            onMouseLeave={() => !readonly && setHover(0)}
            className={`${readonly ? "cursor-default" : "cursor-pointer"} transition-colors`}
          >
            <Star
              className={`h-5 w-5 ${
                filled ? "fill-amber-400 text-amber-400" : "text-muted"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
