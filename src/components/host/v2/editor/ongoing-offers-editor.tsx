"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { listingCtaFor } from "@/lib/host/v2/calendar-listing-draft";
import type { ListingChange } from "@/lib/host/v2/calendar-review";
import type { HostCalendarListingContext } from "@/lib/host/v2/calendar-types";
import {
  OngoingPromotionEditor,
  type OngoingPromotionMode,
} from "@/components/host/v2/calendar/listing-editors";
import { listingCtaLabel } from "@/components/host/v2/calendar/calendar-labels";
import {
  ListingReviewDialog,
  useListingReview,
} from "@/components/host/v2/editor/listing-review";

/**
 * Ongoing offers: the ones with no start and no end, edited where they live.
 *
 * An offer that runs on every date is a listing-wide rule wearing a discount's clothes.
 * It was previously created and ended from the calendar, on a screen the host reached
 * by clearing their date selection — so the way to change "10% off every stay of five
 * nights" was to stop looking at any dates at all. It belongs beside the base price,
 * which is the number it discounts, and that is here.
 *
 * The editor itself is the calendar's, mounted rather than copied: the overlap warning,
 * the quote preview, the rounding rule and the "you cannot waive a cleaning fee you do
 * not charge" check are all business rules, and the point of giving each setting one
 * home is defeated if the rules get a second implementation on the way.
 *
 * Dated offers stay the calendar's. They are listed once, below this editor on the same
 * Promotions tab, with links that carry their own range to the calendar. Keeping them
 * out of this editor's list is what makes it a truthful scope — every offer here is one
 * with no start and no end — rather than a second, duplicate list of every promotion.
 */
export function OngoingOffersEditor({
  context,
}: {
  context: HostCalendarListingContext;
}) {
  const i18n = useI18n();
  const [mode, setMode] = useState<OngoingPromotionMode>("list");
  /** Which saved offer the form is pointed at. Null while creating a new one. */
  const [promotionEditorId, setPromotionEditorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ListingChange | null>(null);
  // A saved offer is no longer a pending edit, so the screen goes back to the list —
  // which is also where the offer the host just wrote now appears.
  const { plan, pending, review, close, confirm } = useListingReview(
    context,
    useCallback(() => {
      setMode("list");
      setPromotionEditorId(null);
      setDraft(null);
    }, []),
  );

  const listOpen = mode === "list";
  const removing =
    draft?.kind === "EVERGREEN_PROMOTION" && draft.action === "REMOVE";

  function backToList() {
    setMode("list");
    setPromotionEditorId(null);
    setDraft(null);
  }

  const ctaText = listOpen
    ? context.listing.promotions.some(
        (promotion) => !promotion.startDate && !promotion.endDate,
      )
      ? i18n.resolve(
          "host.v2.calendar.cta.add_promotion",
          "Add another promotion",
        ).text
      : i18n.resolve(
          "host.v2.calendar.listing.new_promotion",
          "New promotion",
        ).text
    : removing && draft
      ? listingCtaLabel(i18n, listingCtaFor(draft)).text
      : mode === "create"
        ? i18n.resolve("host.v2.calendar.cta.create_promotion", "Create promotion")
            .text
        : i18n.resolve("host.v2.calendar.cta.save_promotion", "Save changes").text;

  return (
    // No heading and no card, for the same reason the price panel has neither: the tab
    // above says "Promotions", the panel's one sentence says what an ongoing offer is,
    // and the "How offers work" popup beside it holds everything that used to be an
    // expanded six-bullet list under these controls.
    <section className="mt-5">
      <OngoingPromotionEditor
        // Keyed on the offer being edited, so switching rows starts the form from
        // that offer's own saved values rather than from the previous one's.
        key={`${mode}:${promotionEditorId ?? ""}`}
        listing={context.listing}
        formats={context.formats}
        today={context.today}
        promotionEditorId={promotionEditorId}
        mode={mode}
        onModeChange={(next) => {
          if (next === "list") backToList();
          else setMode(next);
        }}
        onDraftChange={setDraft}
      />

      {/* Cancel first, then the action, and both at the trailing edge — the same
          arrangement the arrival guide uses, so the primary button sits where a host
          has already learned to look for it. */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {!listOpen ? (
          <button
            type="button"
            onClick={backToList}
            className="min-h-11 rounded-lg px-4 text-sm font-medium text-[var(--ag-foggy)] transition-colors hover:bg-[var(--ag-faint)] hover:text-[var(--ag-hof)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ag-hof)]"
          >
            {i18n.resolve("host.v2.calendar.cancel", "Cancel").text}
          </button>
        ) : null}
        <button
          type="button"
          disabled={!listOpen && (!draft || pending)}
          onClick={() => {
            if (listOpen) {
              setPromotionEditorId(null);
              setMode("create");
              return;
            }
            if (draft) review(draft);
          }}
          className="ag-save inline-flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ag-hof)]"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {ctaText}
        </button>
      </div>

      <ListingReviewDialog
        context={context}
        plan={plan}
        pending={pending}
        onClose={close}
        onConfirm={confirm}
      />
    </section>
  );
}
