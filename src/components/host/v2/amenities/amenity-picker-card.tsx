"use client";

import { Check, Sparkles } from "lucide-react";
import { createElement } from "react";
import { amenityIcon } from "@/lib/amenities/icon-registry";
import {
  amenityDisplayIconKey,
  amenityDisplayLabel,
} from "@/lib/amenities/presentation";
import type { CatalogAmenity } from "@/lib/types/amenity-catalog";
import { cn } from "@/lib/utils";

/**
 * One amenity tile — the single definition used by both the listing editor's picker and
 * the from-scratch flow's Amenities step.
 *
 * Deliberately shared rather than restyled per screen: a host who ticks "Wi-Fi" while
 * creating a listing and again while editing it should be looking at the same control,
 * with the same label, icon and selected state. Everything visible here comes from the
 * admin-managed catalog through `amenityDisplayLabel` / `amenityDisplayIconKey`.
 *
 * Selection reads as weight, not colour: a soft grey fill, a black icon chip and a black
 * tick. No accent hue, so a screen full of ticked cards stays calm.
 */
export function AmenityPickerCard({
  amenity,
  checked,
  onToggle,
  note,
}: {
  amenity: CatalogAmenity;
  checked: boolean;
  onToggle: () => void;
  /** Optional second line, e.g. the editor's "hidden by an admin" marker. */
  note?: React.ReactNode;
}) {
  // `createElement` rather than `<Icon />`: the icon is data resolved per amenity, and a
  // capitalised local would read to the linter as a component defined during render.
  const icon = amenityIcon(amenityDisplayIconKey(amenity)) ?? Sparkles;

  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onToggle}
      className={cn(
        "group relative flex min-h-14 cursor-pointer items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 text-left shadow-[0_3px_14px_rgba(15,23,42,0.08)] outline-none transition-[background-color,box-shadow,transform] hover:shadow-[0_7px_20px_rgba(15,23,42,0.12)] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 md:min-h-[3.75rem] md:px-3",
        checked
          ? "bg-slate-200/80 text-slate-950 shadow-[0_6px_18px_rgba(15,23,42,0.14)] hover:shadow-[0_6px_18px_rgba(15,23,42,0.14)]"
          : "text-slate-800",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 transition-colors",
          checked
            ? "bg-slate-950 text-white"
            : "group-hover:bg-slate-100 group-hover:text-slate-900",
        )}
      >
        {createElement(icon, { className: "size-4", "aria-hidden": true })}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block hyphens-auto break-words text-xs font-medium leading-snug md:text-[0.8125rem]",
            amenity.translated && "notranslate",
          )}
        >
          {amenityDisplayLabel(amenity)}
        </span>
        {note}
      </span>
      {checked && (
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white"
          aria-hidden
        >
          <Check className="size-3.5" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}

/** The grid the tiles sit in. Sized off the container rather than the viewport, because
 *  the editor pane is narrower than the window. */
export const AMENITY_GRID_CLASS =
  "grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 md:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]";
