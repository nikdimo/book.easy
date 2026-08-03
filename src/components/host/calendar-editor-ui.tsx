"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Tx } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The bits of the host calendar's editor sheet that the pre-publish wizard also
 * needs. Both surfaces edit the same three things — blocked dates, custom prices,
 * dated promotions — and the wizard's copy of the UI had drifted into a different
 * design, so the shared pieces live here rather than being written twice.
 *
 * Deliberately free of server-action imports: the wizard is a long client bundle
 * and should not pull the calendar's action graph in just to draw a switch.
 */

/**
 * The commit row stays on screen instead of waiting at the end of a long scroll.
 * The negative margins cancel the sheet body's own p-6 so it spans the sheet.
 */
export const STICKY_FOOTER =
  "sticky bottom-0 z-10 -mx-6 -mb-6 border-t bg-background/95 px-6 py-4 shadow-[0_-8px_20px_rgba(0,0,0,0.04)] backdrop-blur";

/**
 * "Guests will see …" — the offer read back in the guest's words. Four surfaces
 * showed this (calendar sheet, pre-publish plan, the standalone promotion form,
 * the wizard's launch offer) from four copies of the same markup, which had
 * already drifted apart. `headline` is the offer itself; `children` is for the
 * per-surface notes underneath, which should use OFFER_PREVIEW_NOTE.
 */
export function OfferPreview({
  headline,
  children,
}: {
  headline: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-primary/7 p-3">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase md:text-[0.65rem]">
          <Tx k="host.promotion.preview_label" source="Guests will see" />
        </p>
        <p className="mt-0.5 text-sm font-semibold">{headline}</p>
        {children}
      </div>
    </div>
  );
}

export const OFFER_PREVIEW_NOTE = "mt-0.5 text-sm text-muted-foreground md:text-xs";

export function OptionToggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-xl border p-3 text-left transition-colors",
        checked
          ? "border-primary bg-primary/5"
          : "bg-muted/20 hover:border-primary/30",
      )}
    >
      <span>
        <span className="block text-sm md:text-xs font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs md:text-[0.65rem] text-muted-foreground">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/25",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}
