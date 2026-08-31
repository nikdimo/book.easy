import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The parts of the new-listing flow's chrome that a second flow needs to look like the
 * first one.
 *
 * Extracted rather than copied: the progress rail, the black pill and the plain-text
 * Back are what make the listing wizard recognisable, and two flows that redraw them
 * separately drift within a release. What is deliberately *not* here is the footer
 * itself — `ListingFlowFooter` is built on routes and a fixed viewport edge, and the
 * promotion wizard lives inside a dialog with neither. They share these pieces and
 * assemble them differently, which is the honest relationship.
 */

export const FLOW_CTA_CLASS =
  "inline-flex min-h-11 min-w-28 items-center justify-center rounded-full bg-slate-950 px-6 font-heading text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";

export const FLOW_BACK_CLASS =
  "inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";

/**
 * The segmented line that says how far through the flow this screen is.
 *
 * Percentages rather than a step count, because a phase of the listing flow fills its
 * own segment gradually while the two beside it sit at 0 or 100. A flow with three
 * steps just passes 100, 100, 0 and gets the same rail.
 *
 * An untouched segment is the bare rail with nothing inside it, not a fill of zero
 * width. The two paint identically; the distinction is that a segment nobody has
 * reached has no progress to describe, which is what the flow's tests read it as.
 */
export function FlowProgressRail({ segments }: { segments: number[] }) {
  return (
    <div className="absolute inset-x-0 top-0 flex gap-1.5" aria-hidden>
      {segments.map((progress, index) => {
        const filled = Math.max(0, Math.min(100, progress));
        return (
          <span key={index} className="h-1 flex-1 bg-slate-200">
            {filled > 0 ? (
              <span
                className="block h-full bg-slate-950"
                style={{ width: `${filled}%` }}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/**
 * A step's title, and the question mark that holds everything the title does not say.
 *
 * The listing flow prints an explanatory paragraph under each heading. This takes the
 * same idea and gives it no room: the explanation moves into an `InfoSheet` behind an
 * icon, so a screen that needs three sentences of context costs one line instead of
 * four. The words are not lost — `helpLabel` is the button's accessible name and its
 * tooltip, so a screen reader and a hovering mouse both still get them.
 */
export function FlowStepHeading({
  eyebrow,
  title,
  helpLabel,
  onHelp,
  helpRef,
  className,
}: {
  /** Reserved for a screen that closes a phase — the steps themselves carry none, since
   *  the progress rail already says where the host is. */
  eyebrow?: string;
  title: React.ReactNode;
  helpLabel?: string;
  onHelp?: () => void;
  helpRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
}) {
  return (
    <div className={className}>
      {eyebrow ? (
        <p className="font-heading text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {eyebrow}
        </p>
      ) : null}
      <div className="flex items-center gap-2.5">
        <h2 className="font-heading text-[1.6rem] font-semibold leading-[1.15] tracking-[-0.02em] text-slate-950 sm:text-[1.85rem]">
          {title}
        </h2>
        {onHelp && helpLabel ? (
          <button
            ref={helpRef}
            type="button"
            onClick={onHelp}
            aria-label={helpLabel}
            title={helpLabel}
            className="grid size-7 shrink-0 place-items-center rounded-full border border-slate-300 text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          >
            <HelpCircle className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The same control at label size, for a section inside a step rather than the step. */
export function FlowHelpButton({
  label,
  onClick,
  buttonRef,
  className,
}: {
  label: string;
  onClick: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border border-slate-300 text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400",
        className,
      )}
    >
      <HelpCircle className="size-3.5" aria-hidden />
    </button>
  );
}

/** The uppercase label over a group inside a step. */
export function FlowSectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-heading text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-500",
        className,
      )}
    >
      {children}
    </p>
  );
}
