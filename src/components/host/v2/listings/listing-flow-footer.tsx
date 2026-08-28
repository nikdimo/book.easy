"use client";

import { ChevronLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Tx } from "@/lib/i18n/client";

type ListingFlowFooterProps = {
  backHref: string;
  /** The CTA is a link to the next screen, or a handler that keeps the host on this
   *  one. A step that decides between the two at render time may pass both as
   *  optional; the handler wins when it is there. */
  nextHref?: string;
  onNext?: () => void | Promise<void>;
  /** Handled in the tab instead of navigating — for a step whose "back" is an earlier
   *  view of the same screen. `backHref` stays required, and stays the href, so the
   *  control is still a real link before hydration. */
  onBack?: () => void;
  phaseOneProgress: number;
  /** Fills the second segment. A phase-two screen passes 100 for phase one, so the line
   *  reads as one continuous bar rather than restarting. */
  phaseTwoProgress?: number;
  /** Fills the third segment, on the same terms: a phase-three screen passes 100 for
   *  the two segments behind it. */
  phaseThreeProgress?: number;
  nextLabel?: "Continue" | "Next" | "Save and review" | "Publish listing" | "Back to listings";
  hideOnMobile?: boolean;
};

const CTA_CLASS =
  "inline-flex min-h-11 min-w-28 items-center justify-center rounded-full bg-slate-950 px-6 font-heading text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";

export function ListingFlowFooter({
  backHref,
  onBack,
  nextHref,
  onNext,
  phaseOneProgress,
  phaseTwoProgress = 0,
  phaseThreeProgress = 0,
  nextLabel = "Continue",
  hideOnMobile = false,
}: ListingFlowFooterProps) {
  const [pending, setPending] = useState(false);
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  const first = clamp(phaseOneProgress);
  const second = clamp(phaseTwoProgress);
  const third = clamp(phaseThreeProgress);

  async function handleNext() {
    if (!onNext || pending) return;
    setPending(true);
    try {
      await onNext();
    } finally {
      setPending(false);
    }
  }

  // Written out rather than built from `nextLabel`, so the extractor sees both keys.
  const label = (() => {
    switch (nextLabel) {
      case "Next":
        return <Tx k="host.v2.flow.next" source="Next" />;
      // The CTA of a step reached from Review: it says where the host lands, and that
      // the answer they just changed is kept on the way.
      case "Save and review":
        return <Tx k="host.v2.flow.save_and_review" source="Save and review" />;
      case "Publish listing":
        return <Tx k="host.v2.review.publish" source="Publish listing" />;
      case "Back to listings":
        return <Tx k="host.v2.review.done_cta" source="Back to listings" />;
      default:
        return <Tx k="host.v2.flow.continue" source="Continue" />;
    }
  })();

  /**
   * What the CTA holds, in both of its forms below.
   *
   * The label is never swapped out for the spinner: it stays mounted, in the same grid
   * cell, and is only hidden behind it. Replacing it destroyed and re-created its text
   * node on every press, which is fine until something outside React is holding that
   * node — a page-translation layer takes the label away, leaves its own copy in the
   * button and has no idea React then removed the original, so the copy stays. Every
   * screen in the flow has always done this; on all but one it goes unnoticed, because
   * the first press navigates away. House rules with a rule still unanswered is the
   * exception: the host stays put, and ten presses left ten copies behind, so the CTA
   * read "NextNextNext…". The rest of the panel already draws its spinners beside a
   * label that never unmounts, for the same reason.
   */
  const content = (
    <span className="grid place-items-center">
      <span className={`col-start-1 row-start-1${pending ? " invisible" : ""}`}>{label}</span>
      {pending ? (
        <Loader2 className="col-start-1 row-start-1 size-4 animate-spin" aria-hidden />
      ) : null}
    </span>
  );

  return (
    <footer className={`${hideOnMobile ? "hidden lg:block" : "block"} fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-8`}>
      <div className="absolute inset-x-0 top-0 flex gap-1.5" aria-hidden>
        <Segment progress={first} />
        <Segment progress={second} />
        {/* Empty until a phase-three screen fills it: a screen that never reaches phase
            three renders the bare rail it always has. */}
        {third > 0 ? <Segment progress={third} /> : <span className="h-1 flex-1 bg-slate-200" />}
      </div>
      {/* One fixed column for the controls, not the full viewport: the bar itself stays
          edge to edge (so does the progress line above it), but Back and the CTA land on
          exactly the same two x-positions on every screen of the flow. `max-w-5xl` is the
          widest step column (property type, space type, photos), so on those screens the
          buttons sit flush with the first and last card; the narrower steps keep the same
          anchors rather than each moving their CTA to a different place. */}
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <Link
          href={backHref}
          onClick={onBack ? (event) => { event.preventDefault(); onBack(); } : undefined}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        >
          <ChevronLeft className="size-4" aria-hidden />
          <Tx k="host.v2.flow.back" source="Back" />
        </Link>
        {!nextHref ? (
          // No target and no handler is a step that cannot be left yet, not a step
          // whose CTA should quietly send the host back where they came from.
          <button type="button" onClick={() => void handleNext()} disabled={!onNext || pending} className={`${CTA_CLASS} disabled:cursor-not-allowed disabled:bg-slate-300`}>
            {content}
          </button>
        ) : (
          <Link
            href={nextHref}
            aria-disabled={pending || undefined}
            onClick={onNext ? (event) => { event.preventDefault(); void handleNext(); } : undefined}
            className={`${CTA_CLASS} ${pending ? "pointer-events-none bg-slate-300" : ""}`}
          >
            {content}
          </Link>
        )}
      </div>
    </footer>
  );
}

/** One filled segment of the three-part progress line. */
function Segment({ progress }: { progress: number }) {
  return (
    <span className="h-1 flex-1 bg-slate-200">
      <span className="block h-full bg-slate-950" style={{ width: `${progress}%` }} />
    </span>
  );
}
