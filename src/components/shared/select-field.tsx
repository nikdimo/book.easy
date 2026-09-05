"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Radix refuses an item whose value is the empty string — it reserves "" for "nothing
 * chosen", which is how the placeholder is decided. Several of our fields do have a real
 * choice stored as "" (a flexible check-in time, an "all statuses" filter), so the empty
 * value is swapped for this sentinel on the way in and swapped back on the way out. The
 * value the caller sees, stores and posts is unchanged.
 */
const EMPTY_VALUE = "__select_field_empty__";

export type SelectFieldOption = {
  value: string;
  /** What the menu row shows. */
  label: React.ReactNode;
  /** What the closed trigger shows, when `label` is markup rather than a plain string. */
  triggerLabel?: string;
  disabled?: boolean;
};

/**
 * The application's dropdown, for every place that was reaching for a native `<select>`.
 *
 * A native select draws its popup with the operating system: unstyled rows, its own
 * typography, its own scrollbar, and on desktop a list that can run the height of the
 * screen. Next to our own controls it reads as a different product, which is the whole
 * reason this exists. Inside it is `ui/select` — the same Radix listbox the payment,
 * marketplace and admin screens already use — so a dropdown looks and behaves the same
 * everywhere: the same 44px trigger, border, radius and chevron, the same portalled menu
 * that cannot be clipped by a card or a drawer, and the same keyboard contract Radix
 * gives it (Enter/Space to open, arrows and type-ahead to move, Escape to close, focus
 * returned to the trigger).
 *
 * Values in and out are the caller's own strings; nothing here reshapes the payload.
 */
export function SelectField({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  invalid = false,
  className,
  contentClassName,
  size,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  /** Shown while nothing is chosen. Only reachable when "" is not itself an option. */
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  invalid?: boolean;
  className?: string;
  contentClassName?: string;
  size?: "sm" | "default";
}) {
  const hasEmptyOption = options.some((option) => option.value === "");
  const toRadix = (next: string) =>
    hasEmptyOption && next === "" ? EMPTY_VALUE : next;
  const fromRadix = (next: string) => (next === EMPTY_VALUE ? "" : next);

  const selected = options.find((option) => option.value === value);

  return (
    <Select
      value={toRadix(value)}
      onValueChange={(next) => onValueChange(fromRadix(next))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        // `whitespace-normal` and `min-w-0` replace the trigger's default nowrap: a
        // full-width form field has to be allowed to shrink on a 375px phone, and the
        // value inside is already clamped to one line, so nothing wraps in practice.
        className={cn(
          "w-full min-w-0 justify-between whitespace-normal bg-white",
          className,
        )}
      >
        {/* Passing the label as children rather than letting Radix mirror the selected
            item's text: the item only mounts on the client, so the mirrored version
            leaves the trigger blank in the server-rendered HTML and fills in on
            hydration. These screens are server rendered, so that flash is visible. */}
        <SelectValue placeholder={placeholder}>
          {selected ? (selected.triggerLabel ?? selected.label) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={toRadix(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
