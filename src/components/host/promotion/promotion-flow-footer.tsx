"use client";

import { ChevronLeft, Loader2 } from "lucide-react";
import * as React from "react";
import { Tx } from "@/lib/i18n/client";
import {
  FLOW_BACK_CLASS,
  FLOW_CTA_CLASS,
  FlowProgressRail,
} from "@/components/host/flow-chrome";

/**
 * The new-listing flow's footer, for a flow that lives in a dialog.
 *
 * A sibling of `ListingFlowFooter` rather than a mode of it. That one is built on two
 * things this has neither of: a route per step, so both controls are real `Link`s with
 * an href that works before hydration, and a fixed viewport edge to pin itself to. Here
 * the steps are state inside one panel and the footer is the panel's own last row.
 * Forcing one component to be both would have meant every prop becoming optional and a
 * label union carrying two flows' worth of copy — see `flow-chrome` for what they
 * genuinely do share, which is the rail, the pill and the plain-text Back.
 *
 * It bleeds through the dialog's padding to the panel edges, so the rail spans the full
 * width the way it does across the bottom of a step page. `--dialog-inset` is the
 * dialog's own variable, so this stays correct at both breakpoints without repeating
 * the number.
 */
export function PromotionFlowFooter({
  segments,
  onBack,
  backLabel,
  onNext,
  nextLabel,
  nextDisabled = false,
  status,
}: {
  /** Three percentages, matching the listing flow's three-part rail. */
  segments: number[];
  /** Absent on the first step, where there is nothing behind this screen. */
  onBack?: () => void;
  backLabel?: string;
  onNext: () => void | Promise<void>;
  nextLabel: React.ReactNode;
  nextDisabled?: boolean;
  /** A quiet line beside the CTA — the posting step's "1 of 5" counter. */
  status?: React.ReactNode;
}) {
  const [pending, setPending] = React.useState(false);

  async function handleNext() {
    if (pending || nextDisabled) return;
    setPending(true);
    try {
      await onNext();
    } finally {
      setPending(false);
    }
  }

  // The label stays mounted behind the spinner rather than being swapped out for it.
  // `ListingFlowFooter` explains why at length: a page-translation layer that has taken
  // the text node away has no idea React then removed the original, and every press
  // leaves another copy behind.
  const content = (
    <span className="grid place-items-center">
      <span className={`col-start-1 row-start-1${pending ? " invisible" : ""}`}>
        {nextLabel}
      </span>
      {pending ? (
        <Loader2
          className="col-start-1 row-start-1 size-4 animate-spin"
          aria-hidden
        />
      ) : null}
    </span>
  );

  return (
    <footer className="relative -mx-[var(--dialog-inset)] -mb-[var(--dialog-pb)] mt-auto shrink-0 border-t border-slate-200 bg-white px-[var(--dialog-inset)] pb-[var(--dialog-pb)] pt-4">
      <FlowProgressRail segments={segments} />
      <div className="flex items-center justify-between gap-4">
        {onBack ? (
          <button type="button" onClick={onBack} className={FLOW_BACK_CLASS}>
            <ChevronLeft className="size-4" aria-hidden />
            {backLabel ?? <Tx k="host.v2.flow.back" source="Back" />}
          </button>
        ) : (
          // Holds the CTA on the same x-position as every other step rather than
          // letting it slide left on the one screen with nothing to go back to.
          <span aria-hidden />
        )}
        <div className="flex min-w-0 items-center gap-3">
          {status ? (
            <span className="truncate text-sm text-slate-500">{status}</span>
          ) : null}
          <button
            type="button"
            onClick={() => void handleNext()}
            disabled={nextDisabled || pending}
            className={`${FLOW_CTA_CLASS} disabled:cursor-not-allowed disabled:bg-slate-300`}
          >
            {content}
          </button>
        </div>
      </div>
    </footer>
  );
}
