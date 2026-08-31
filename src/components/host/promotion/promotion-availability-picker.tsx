"use client";

import * as React from "react";
import type { DateRange } from "react-day-picker";
import { CalendarPlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangeCalendarStep } from "@/components/marketplace/marketplace-stay-date-picker";
import { Tx, interpolate, useI18n } from "@/lib/i18n/client";
import { formatAvailabilityRange } from "@/lib/facebook-share";
import { checkPromotionRangeAction } from "@/lib/actions/facebook-promotion.actions";
import type {
  PromotionListingView,
  PromotionRangeRejection,
} from "@/lib/services/listing-promotion.service";

export interface PromotionRange {
  checkIn: string;
  checkOut: string;
  /** The day availability was last confirmed, which is what the post's freshness line
   *  states. Stored with the range so re-checking updates both together. */
  checkedOn: string;
}

/** `yyyy-MM-dd` as this browser's own midnight — the form react-day-picker compares. */
function localMidnight(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Turns a server rejection code into the sentence that tells the host what to do next.
 *
 * Every one of these ends in an action, because the range they picked is gone and the
 * only way forward is another selection. A bare "unavailable" would leave them
 * pressing the same dates again.
 */
export function useRangeRejectionMessage() {
  const { resolve } = useI18n();
  return React.useCallback(
    (reason: PromotionRangeRejection, detail?: { minNights?: number; maxNights?: number }) => {
      switch (reason) {
        case "ALREADY_BOOKED":
          return resolve(
            "host.promote.range_error.booked",
            "Those dates were booked or blocked in the meantime. Pick another range.",
          ).text;
        case "NOT_OPEN":
          return resolve(
            "host.promote.range_error.not_open",
            "Those dates are not open on your calendar. Pick a range inside your available dates.",
          ).text;
        case "BELOW_MINIMUM":
          return interpolate(
            resolve(
              "host.promote.range_error.too_short",
              "Your minimum stay is {nights} nights. Pick a longer range.",
            ),
            { nights: detail?.minNights ?? 1 },
          ).text;
        case "ABOVE_MAXIMUM":
          return interpolate(
            resolve(
              "host.promote.range_error.too_long",
              "Your maximum stay is {nights} nights. Pick a shorter range.",
            ),
            { nights: detail?.maxNights ?? 1 },
          ).text;
        case "IN_THE_PAST":
          return resolve(
            "host.promote.range_error.past",
            "That range has already started. Pick dates in the future.",
          ).text;
        case "LISTING_NOT_PROMOTABLE":
          return resolve(
            "host.promote.range_error.not_promotable",
            "This property is no longer published, so it cannot be promoted.",
          ).text;
        default:
          return resolve(
            "host.promote.range_error.invalid",
            "Those dates are not a valid stay. Pick a check-in and a check-out.",
          ).text;
      }
    },
    [resolve],
  );
}

/**
 * "Add availability" — the deliberate, opt-in way dates enter a promotion post.
 *
 * There is no preselected range and no checkbox that quietly turns one on. A host who
 * never opens this picker gets a post with no dates in it, which is the honest output:
 * the alternative is guessing a week and advertising it.
 *
 * One range, not several. A post reads as an offer, and "1–8 October, 14–19 October and
 * 2–9 November" is a spreadsheet; a single range is also the only shape that can put
 * `checkIn`/`checkOut` on the shared link so the guest arrives with the dates already
 * selected. Multiple ranges are a deliberate follow-up, not an omission.
 */
export function PromotionAvailabilityPicker({
  listing,
  value,
  onChange,
}: {
  listing: PromotionListingView;
  value: PromotionRange | null;
  onChange: (range: PromotionRange | null) => void;
}) {
  const i18n = useI18n();
  const rejectionMessage = useRangeRejectionMessage();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);

  const disabledDateRanges = React.useMemo(
    () =>
      listing.blockedDateRanges.map((range) => ({
        from: localMidnight(range.from),
        to: localMidnight(range.to),
      })),
    [listing.blockedDateRanges],
  );

  async function confirm() {
    if (!draft?.from || !draft?.to) return;
    const checkIn = toYmd(draft.from);
    const checkOut = toYmd(draft.to);
    setChecking(true);
    setError(null);
    try {
      // The calendar already greys out blocked days, but that payload was fetched when
      // the dialog opened. This is the authoritative answer, from the same rules the
      // booking service applies.
      const result = await checkPromotionRangeAction(listing.id, checkIn, checkOut);
      if (!result.ok) {
        setError(rejectionMessage("LISTING_NOT_PROMOTABLE"));
        return;
      }
      if (!result.data.ok) {
        setError(rejectionMessage(result.data.reason, result.data));
        return;
      }
      onChange({ checkIn, checkOut, checkedOn: listing.today });
      setOpen(false);
    } catch {
      setError(
        i18n.resolve(
          "host.promote.range_error.verify",
          "We could not verify those dates. Check your connection and try again.",
        ).text,
      );
    } finally {
      setChecking(false);
    }
  }

  const formattedRange = value
    ? formatAvailabilityRange(value.checkIn, value.checkOut, i18n.requestedLocale)
    : "";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm font-medium">
              <span aria-hidden>📅</span>
              <span translate="no" className="notranslate">
                {formattedRange}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft({
                  from: localMidnight(value.checkIn),
                  to: localMidnight(value.checkOut),
                });
                setError(null);
                setOpen(true);
              }}
            >
              <Tx k="host.promote.availability.change" source="Change dates" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setDraft(undefined);
              }}
            >
              <X className="size-4" aria-hidden />
              <Tx k="host.promote.availability.remove" source="Remove dates" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            <CalendarPlus className="size-4" aria-hidden />
            <Tx k="host.promote.availability.add" source="Add availability" />
          </Button>
        )}
      </div>

      {!value && !open && (
        <p className="text-xs text-muted-foreground">
          <Tx
            k="host.promote.availability.hint"
            source="Optional. Pick a range from your real calendar — nothing is added to the post unless you choose dates."
          />
        </p>
      )}

      {open && (
        <div className="rounded-xl border bg-card p-3">
          <div className="max-h-[42vh] overflow-y-auto md:max-h-none">
            <DateRangeCalendarStep
              active={open}
              selected={draft}
              onRangeChange={(range) => {
                setDraft(range);
                setError(null);
              }}
              disabledDateRanges={disabledDateRanges}
              minimumStayNights={listing.minNights}
              maximumStayNights={listing.maxNights ?? undefined}
              dayVariant="availability"
              dragToSelect
              toggleSelectedRange
              locale={i18n.requestedLocale}
              fitViewport
              pagedDesktopMonthCount={2}
            />
          </div>

          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              <Tx k="host.promote.availability.cancel" source="Cancel" />
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!draft?.from || !draft?.to || checking}
              onClick={() => void confirm()}
            >
              {checking && <Loader2 className="size-4 animate-spin" aria-hidden />}
              <Tx k="host.promote.availability.use" source="Use these dates" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
