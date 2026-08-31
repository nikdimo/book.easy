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
 * Dated offers stay the calendar's. They are reported once, in the "Particular dates"
 * section below this editor, with links that carry their range to the calendar. Keeping
 * them out of this list makes "Ongoing offers" a truthful scope instead of a second,
 * duplicate list of every promotion.
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
    <section
      aria-labelledby="pricing-offers-heading"
      className="mt-4 rounded-2xl border border-slate-200 p-5"
    >
      <h3 id="pricing-offers-heading" className="text-sm font-semibold text-slate-900">
        {i18n.resolve("host.editor.pricing.offers_title", "Ongoing offers").text}
      </h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        {
          i18n.resolve(
            "host.editor.pricing.offers_lead",
            "Discounts that run on every date until you end them. Offers for particular dates are set on the calendar.",
          ).text
        }
      </p>

      <div className="mt-5">
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
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
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
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none disabled:bg-slate-100 disabled:text-slate-400"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {ctaText}
        </button>
        {!listOpen ? (
          <button
            type="button"
            onClick={backToList}
            className="min-h-11 rounded-full px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100 focus-visible:outline-none"
          >
            {i18n.resolve("host.v2.calendar.cancel", "Cancel").text}
          </button>
        ) : null}
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
