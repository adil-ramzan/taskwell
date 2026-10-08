"use client";

import { LABEL_COLORS, labelColorNames, type LabelColor } from "@/lib/label-rules";
import { swatchColors } from "./LabelChip";

interface LabelColorPickerProps {
  /** Shared by the radios; unique on the page. */
  name: string;
  value: LabelColor;
  onChange: (color: LabelColor) => void;
  disabled?: boolean;
}

/**
 * The palette as a radio group: arrow keys move between colours, each swatch
 * has its colour's name for screen readers, and the chosen one is marked by a
 * ring as well as by being checked.
 */
export default function LabelColorPicker({ name, value, onChange, disabled }: LabelColorPickerProps) {
  return (
    <div role="radiogroup" aria-label="Label color" className="flex flex-wrap gap-1">
      {LABEL_COLORS.map((color) => (
        <label
          key={color}
          title={labelColorNames[color]}
          className="relative inline-flex h-11 w-9 cursor-pointer items-center justify-center has-[:disabled]:cursor-not-allowed"
        >
          <input
            type="radio"
            name={name}
            value={color}
            checked={value === color}
            disabled={disabled}
            onChange={() => onChange(color)}
            // Invisible but the full size of the swatch, so the control itself is what gets clicked or tapped.
            className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span
            aria-hidden="true"
            className={`h-6 w-6 rounded-full ${swatchColors[color]} ring-offset-2 ring-offset-white peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-disabled:opacity-50 dark:ring-offset-dark-surface dark:peer-checked:ring-white`}
          />
          <span className="sr-only">{labelColorNames[color]}</span>
        </label>
      ))}
    </div>
  );
}
