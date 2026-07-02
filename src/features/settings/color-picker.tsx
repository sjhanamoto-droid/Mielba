"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { AVATAR_COLORS, DEFAULT_AVATAR_COLOR } from "@/lib/constants";
import { cn } from "@/lib/utils";

// アバター色のスウォッチ選択。hidden input に選択値を出力。
export function ColorPicker({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: string;
}) {
  const [color, setColor] = useState(defaultValue || DEFAULT_AVATAR_COLOR);
  return (
    <div>
      <input type="hidden" name={name} value={color} />
      <div className="flex flex-wrap gap-2.5">
        {AVATAR_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setColor(c.value)}
            aria-label={c.label}
            aria-pressed={color === c.value}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-offset-2 transition-all active:scale-90",
              color === c.value ? "ring-ink/40" : "ring-transparent",
            )}
            style={{ backgroundColor: c.value }}
          >
            {color === c.value && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
          </button>
        ))}
      </div>
    </div>
  );
}
