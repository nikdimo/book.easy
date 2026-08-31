"use client";

import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one save button shape this page uses, three times.
 *
 * Payment methods, deposits and cancellation are still three independent writes, to
 * three server actions, against three persistence boundaries — collapsing them behind a
 * single button would let one request succeed while another fails and leave the host
 * looking at a screen that says "Saved". So the page keeps three, and makes them quiet
 * and identical instead: same size, same radius, same position, each one directly under
 * the section it writes. What distinguishes them is their label and the line beside it,
 * not their weight.
 */
export const SECTION_SAVE_BUTTON = "rounded-full bg-slate-900 px-5 hover:bg-slate-800";

/**
 * A section's status line and its save button, on one row.
 *
 * The status sits on the left and the button on the right on a wide screen; on a phone
 * they stack with the button on top of the reading order's bottom — `flex-col-reverse`,
 * so the DOM keeps status-then-button while the eye gets button-then-status. The status
 * is a live region because it is the only thing that reports a refused write.
 */
export function SectionSaveRow({
  status,
  saving,
  disabled = false,
  label,
  savingLabel,
}: {
  /** The section's own status text. Already worded for that section. */
  status: React.ReactNode;
  saving: boolean;
  disabled?: boolean;
  label: React.ReactNode;
  /** What the button says mid-flight. Falls back to the label with a spinner. */
  savingLabel?: React.ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
      {status}
      <Button
        type="submit"
        disabled={disabled || saving}
        className={cn(SECTION_SAVE_BUTTON, "w-full sm:w-auto")}
      >
        {saving ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {saving ? (savingLabel ?? label) : label}
      </Button>
    </div>
  );
}

/** The quiet status line every section's save row carries. */
export function SectionStatusLine({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-6 items-center gap-2 text-sm",
        tone === "error" ? "text-rose-700" : "text-slate-500",
      )}
    >
      {children}
    </p>
  );
}
