"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import { useI18n } from "@/lib/i18n/client";
import { buildListingCalendarIndex } from "@/lib/host/v2/calendar-model";
import {
  buildListingReviewPlan,
  type ListingChange,
  type ReviewPlan,
} from "@/lib/host/v2/calendar-review";
import type { HostCalendarListingContext } from "@/lib/host/v2/calendar-types";
import { runMutationSteps } from "@/components/host/v2/calendar/calendar-actions";
import { ReviewDialog } from "@/components/host/v2/calendar/review-dialog";

/**
 * "Read it back, then save it" — for the listing editor's listing-wide settings.
 *
 * The calendar has always confirmed a listing-wide change before writing it, because
 * one of them moves every future date at once: the default availability decides what a
 * guest can even search for, and the base price decides what every unpriced night
 * costs. Moving those settings into the listing editor did not make them smaller, so
 * the confirmation came with them — the same `buildListingReviewPlan`, the same
 * `ReviewDialog`, the same `runMutationSteps`, and therefore the same server actions
 * with the same ownership checks, audit logging and revalidation behind them.
 *
 * That is also why these sections do not autosave. Everything else in this editor does,
 * and a host who types a title expects it to stick; a host who changes their base price
 * from 60 to 6 by leaning on a key should be shown what that means first.
 *
 * This hook owns exactly the plumbing: which change is being reviewed, what plan it
 * produces, and what happens on confirm. It never decides *what* a change is — each
 * form does that by handing over a `ListingChange`.
 */
export function useListingReview(
  context: HostCalendarListingContext,
  /** Run after a write lands, before the refresh — how a form returns to its rest state. */
  onSaved?: () => void,
) {
  const i18n = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [change, setChange] = useState<ListingChange | null>(null);

  // Built from the same payload the calendar builds it from, so the consequences a
  // host reads here — how many dates change, how many stay blocked — are the numbers
  // the calendar would have shown them.
  const index = useMemo(
    () => buildListingCalendarIndex(context.listing),
    [context.listing],
  );

  const plan: ReviewPlan | null = useMemo(() => {
    if (!change) return null;
    return buildListingReviewPlan({
      listing: context.listing,
      index,
      change,
      today: context.today,
      horizonEnd: context.horizonEnd,
      horizonMonths: context.horizonMonths,
    });
  }, [change, context, index]);

  const close = useCallback(() => {
    // A save already in flight owns the dialog: closing under it would leave the host
    // looking at a form while a write they can no longer see is still running.
    if (!pending) setChange(null);
  }, [pending]);

  const confirm = useCallback(() => {
    if (!plan?.savable) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof runMutationSteps>>;
      try {
        result = await runMutationSteps(context.listing.id, plan.steps);
      } catch {
        toast.error(
          i18n.resolve(
            "host.v2.calendar.save_failed",
            "Your change could not be saved. Nothing on this screen was cleared; try again.",
          ).text,
        );
        return;
      }
      // A failed write leaves the review open on the host's own draft, so it can be
      // corrected or retried without retyping anything.
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setChange(null);
      onSaved?.();
      router.refresh();
      toast.success(
        i18n.resolve("host.v2.calendar.saved", "Your change is live.").text,
      );
    });
  }, [plan, context.listing.id, i18n, router, onSaved]);

  return { plan, pending, review: setChange, close, confirm };
}

/**
 * The confirmation itself.
 *
 * A thin wrapper over the calendar's dialog rather than a second one: the rows, the
 * before/after values and the "what happens when you save" list are the vocabulary a
 * host has already learned there, and two dialogs describing the same change in two
 * ways is precisely the duplication this redesign exists to remove.
 */
export function ListingReviewDialog({
  context,
  plan,
  pending,
  onClose,
  onConfirm,
}: {
  context: HostCalendarListingContext;
  plan: ReviewPlan | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!plan) return null;
  return (
    <ReviewDialog
      open
      plan={plan}
      // The property, not a date range: everything reviewed here applies listing-wide.
      scopeLabel={context.listing.title}
      currency={context.listing.pricing?.currency ?? BASE_CURRENCY}
      formats={context.formats}
      pending={pending}
      // Only a date block carries a private note, and nothing here is one.
      note={null}
      onNoteChange={() => {}}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onConfirm={onConfirm}
    />
  );
}
