"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import { useI18n } from "@/lib/i18n/client";
import { createListingPricing } from "@/lib/actions/pricing.actions";
import type { ListingChange } from "@/lib/host/v2/calendar-review";
import type { HostCalendarListingContext } from "@/lib/host/v2/calendar-types";
import { wholeAmountFromInput } from "@/lib/host/v2/calendar-price-action";
import { DefaultPricingEditor } from "@/components/host/v2/calendar/listing-editors";
import {
  ColumnPair,
  NumberColumn,
} from "@/components/host/v2/calendar/workbench-ui";
import { currencySymbol } from "@/components/host/v2/calendar/calendar-labels";
import {
  ListingReviewDialog,
  useListingReview,
} from "@/components/host/v2/editor/listing-review";

/**
 * Default pricing: the listing's base price and cleaning fee.
 *
 * The form itself is the calendar's DefaultPricingEditor, mounted here rather than
 * copied. That matters more than it looks: it carries the percentage field, the slider,
 * the worked example priced by the real quote engine, and the line stating how many
 * dates the host has priced by hand and will therefore keep their own price. A second
 * implementation would have been a second answer to "what does this change cost me".
 *
 * Saving is explicit and grouped — one review for both numbers — because they are
 * weighed together and because each one reaches further than the page it is typed on:
 * the base price sets every night without a price of its own, the cleaning fee is
 * charged on every stay, and dropping that fee to zero ends any free-cleaning benefit
 * an active offer is promising. The review names all of that before anything is
 * written.
 *
 * Stay length is deliberately absent. How long a guest may stay is a booking rule, not
 * an amount, and it is edited under Availability → Booking rules — one editable home,
 * and no disabled field here explaining that it is somewhere else.
 */
export function PricingDefaultsEditor({
  context,
}: {
  context: HostCalendarListingContext;
}) {
  const i18n = useI18n();
  const { plan, pending, review, close, confirm } = useListingReview(context);
  // The form reports its own staged change upwards, exactly as it did inside the
  // calendar panel; this screen owns the button that turns it into a review.
  const [draft, setDraft] = useState<ListingChange | null>(null);

  if (!context.listing.pricing) {
    return <FirstPriceForm context={context} />;
  }

  return (
    <section
      aria-labelledby="pricing-defaults-heading"
      className="mt-6 rounded-2xl border border-slate-200 p-5"
    >
      <h3
        id="pricing-defaults-heading"
        className="text-sm font-semibold text-slate-900"
      >
        {i18n.resolve("host.editor.pricing.defaults_title", "Default pricing").text}
      </h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        {
          i18n.resolve(
            "host.editor.pricing.defaults_lead",
            "What a night costs and what cleaning costs, unless a particular date says otherwise.",
          ).text
        }
      </p>

      <div className="mt-5">
        <DefaultPricingEditor
          listing={context.listing}
          formats={context.formats}
          today={context.today}
          onDraftChange={setDraft}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          disabled={!draft || pending}
          onClick={() => draft && review(draft)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none disabled:bg-slate-100 disabled:text-slate-400"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {
            i18n.resolve(
              "host.editor.pricing.review_cta",
              "Review and save pricing",
            ).text
          }
        </button>
        <p className="text-sm leading-6 text-slate-500">
          {draft
            ? i18n.resolve(
                "host.editor.pricing.defaults_pending",
                "Nothing changes until you confirm.",
              ).text
            : i18n.resolve(
                "host.editor.pricing.defaults_current",
                "These are the current values.",
              ).text}
        </p>
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

/**
 * The path out of "this listing has no price at all".
 *
 * A listing with no pricing rule cannot be quoted, cannot be published and — before
 * this — could not be given a price from the one page that owns its price: the summary
 * said "no prices have been set" and sent the host to a calendar whose pricing editor
 * says the same thing back at them. That is the dead end this replaces.
 *
 * No review dialog. A review exists to show what a change does to what is already
 * there, and there is nothing there; the full editor above — with its worked example,
 * its consequences and its confirmation — is what the host gets from the moment the
 * rule exists. The currency is the platform's authoring currency, the same one every
 * other listing's rule is created with.
 */
function FirstPriceForm({ context }: { context: HostCalendarListingContext }) {
  const i18n = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [baseNightlyRate, setBaseNightlyRate] = useState("");
  const [cleaningFee, setCleaningFee] = useState("0");

  const symbol = currencySymbol(BASE_CURRENCY, context.formats);
  const base = wholeAmountFromInput(baseNightlyRate);
  const fee = wholeAmountFromInput(cleaningFee);
  const valid = base !== null && base >= 1 && fee !== null && fee >= 0;

  function save() {
    if (!valid || base === null || fee === null) return;
    startTransition(async () => {
      // Two amounts, and no stay rule. The new rule needs *some* minimum in the
      // column, but the server supplies the neutral one; sending it from here would
      // make this form a second editable home for a booking rule that belongs under
      // Availability → Booking rules.
      const result = await createListingPricing(context.listing.id, {
        baseNightlyRate: base,
        cleaningFee: fee,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(
        result.success ??
          i18n.resolve("host.v2.calendar.saved", "Your change is live.").text,
      );
    });
  }

  return (
    <section
      aria-labelledby="pricing-first-heading"
      className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-5"
    >
      <h3 id="pricing-first-heading" className="text-sm font-semibold text-slate-900">
        {i18n.resolve("host.editor.pricing.first_title", "Set your nightly price").text}
      </h3>
      <p className="mt-1 text-sm leading-6 text-slate-700">
        {
          i18n.resolve(
            "host.editor.pricing.first_body",
            "This listing has no price yet, so no date can be booked. Give it a nightly price to start.",
          ).text
        }
      </p>

      <div className="mt-5 rounded-xl bg-white p-4">
        <ColumnPair>
          <NumberColumn
            id="host-v2-first-base-price"
            label={
              i18n.resolve("host.v2.calendar.listing.base_price", "Base price").text
            }
            caption={
              i18n.resolve("host.v2.calendar.editor.per_night", "per night").text
            }
            value={baseNightlyRate}
            prefix={symbol}
            onChange={setBaseNightlyRate}
          />
          <NumberColumn
            id="host-v2-first-cleaning-fee"
            label={
              i18n.resolve("host.v2.calendar.listing.cleaning_fee", "Cleaning fee")
                .text
            }
            caption={
              i18n.resolve("host.v2.calendar.listing.per_stay", "per stay").text
            }
            value={cleaningFee}
            prefix={symbol}
            onChange={setCleaningFee}
          />
        </ColumnPair>
      </div>

      <button
        type="button"
        disabled={!valid || pending}
        onClick={save}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none disabled:bg-slate-200 disabled:text-slate-500"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {i18n.resolve("host.editor.pricing.first_cta", "Save nightly price").text}
      </button>
    </section>
  );
}
