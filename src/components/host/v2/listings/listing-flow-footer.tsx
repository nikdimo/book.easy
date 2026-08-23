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
  nextLabel?: "Continue" | "Next" | "Publish listing" | "Back to listings";
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
      case "Publish listing":
        return <Tx k="host.v2.review.publish" source="Publish listing" />;
      case "Back to listings":
        return <Tx k="host.v2.review.done_cta" source="Back to listings" />;
      default:
        return <Tx k="host.v2.flow.continue" source="Continue" />;
    }
  })();

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
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : label}
          </button>
        ) : (
          <Link
            href={nextHref}
            aria-disabled={pending || undefined}
            onClick={onNext ? (event) => { event.preventDefault(); void handleNext(); } : undefined}
            className={`${CTA_CLASS} ${pending ? "pointer-events-none bg-slate-300" : ""}`}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : label}
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
