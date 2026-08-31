"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import { ChevronDown } from "lucide-react";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { CALENDAR_ANCHOR, anchorProps } from "@/lib/host/v2/calendar-anchors";
import type { CalendarFormats } from "@/lib/host/v2/calendar-format";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import type { ListingChange } from "@/lib/host/v2/calendar-review";
import {
  computeSelectionQuote,
  type ProposedPromotion,
} from "@/lib/host/v2/calendar-quote";
import {
  evergreenMinimumClash,
  evergreenPromotions,
} from "@/lib/host/v2/calendar-promotion-action";
import {
  defaultsDraft,
  ongoingPromotionDraft,
  ongoingPromotionFormOf,
  type OngoingPromotionForm,
} from "@/lib/host/v2/calendar-listing-draft";
import { addDaysToYmd } from "@/lib/utils/date-only";
import {
  ColumnPair,
  ConsequenceLine,
  Disclosure,
  NumberColumn,
  StepperColumn,
  ToggleRow,
} from "./workbench-ui";
import { PanelSlider } from "./panel-slider";
import { AllPromotionsOverview, HowOffersWork } from "./promotion-help";
import {
  percentFromPrice,
  priceFromPercent,
  PRICE_PERCENT_PRESETS,
  PRICE_PERCENT_RANGE,
  wholeAmountFromInput,
} from "@/lib/host/v2/calendar-price-action";
import {
  currencySymbol,
  formatSignedPercent,
  money,
} from "./calendar-labels";

/**
 * The focused editors for the listing's own defaults, rather than for a date range.
 *
 * They live beside the calendar because they are built out of the same small parts —
 * `workbench-ui`, the panel slider, the calendar's own labels and its quote engine —
 * but the calendar no longer mounts them. **The listing editor does:** these are the
 * insides of `/host/listings/<id>/pricing`, which is the one editable home for the
 * base price, the cleaning fee, the minimum stay and the always-active offers. The
 * calendar shows those values as read-only context and links here.
 *
 * They were not copied for that move, and deliberately so: a second implementation is
 * a second answer to "what does a 15% offer cost me", and the whole point of the
 * split is that each setting has exactly one home.
 *
 * Neither of them saves anything. Each reports a `ListingChange | null` upwards, the
 * way the date editors report a `DateChange | null`, and the surrounding screen's
 * Review button is enabled precisely when that value is non-null.
 */

const QUICK_DISCOUNTS = [5, 10, 15, 20] as const;

/**
 * A worked example priced by the canonical quote engine.
 *
 * Listing-wide screens have no selected dates, so the example is a stay of the
 * listing's own minimum length starting tomorrow, priced against a copy of the listing
 * that carries the drafted rule. Date overrides and dated offers are stripped from that
 * copy on purpose: this is an example of what the *default* does, and a custom price
 * that happens to fall on the sample dates would make it an example of something else.
 */
function useDefaultStayQuote({
  listing,
  today,
  pricing,
  promotions,
  nights,
}: {
  listing: HostCalendarListing;
  today: string;
  pricing: HostCalendarListing["pricing"];
  promotions: HostCalendarListing["promotions"];
  nights: number;
}) {
  return useMemo(() => {
    if (!pricing) return null;
    const start = addDaysToYmd(today, 1);
    const sample: HostCalendarListing = {
      ...listing,
      pricing,
      promotions,
      datePrices: [],
    };
    return computeSelectionQuote({
      listing: sample,
      selection: { start, end: addDaysToYmd(start, Math.max(1, nights) - 1) },
    });
  }, [listing, today, pricing, promotions, nights]);
}

/**
 * What a guest would pay under the rule being drafted, in one line.
 *
 * It used to be four: a caption, accommodation, cleaning, total. On a panel this narrow
 * that pushed the save button below the fold, and a host who has to scroll to reach the
 * only action on the screen will not read the four lines anyway. The total is the answer;
 * the arithmetic behind it is one tap away for whoever wants to check it.
 */
function ExampleTotal({
  quote,
  currency,
  formats,
  nights,
  caption,
}: {
  quote: ReturnType<typeof computeSelectionQuote>;
  currency: string;
  formats: CalendarFormats;
  nights: number;
  caption: string;
}) {
  const i18n = useI18n();
  if (!quote) return null;
  const format = (amount: number) => money(amount, currency, formats);
  return (
    <div className="border-t border-slate-100 pt-3">
      <p className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className="min-w-0 text-slate-600">{caption}</span>
        <span className="shrink-0 font-semibold tabular-nums text-slate-900">
          {format(quote.total)}
        </span>
      </p>
      <Disclosure
        label={
          i18n.resolve(
            "host.v2.calendar.editor.price_breakdown",
            "View price breakdown",
          ).text
        }
      >
        <dl className="flex flex-col gap-1 pb-1 text-[0.8125rem]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-600">
              {
                interpolate(
                  i18n.plural(
                    "host.v2.calendar.quote.accommodation",
                    nights,
                    "Accommodation, {n} night",
                    "Accommodation, {n} nights",
                  ),
                  {},
                ).text
              }
            </dt>
            <dd className="shrink-0 tabular-nums text-slate-700">
              {format(quote.originalAccommodationSubtotal)}
            </dd>
          </div>
          {quote.originalCleaningFee > 0 ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-600">
                {i18n.resolve("host.v2.calendar.quote.cleaning", "Cleaning fee").text}
              </dt>
              <dd className="shrink-0 tabular-nums text-slate-700">
                {format(quote.cleaningDiscount > 0 ? 0 : quote.originalCleaningFee)}
              </dd>
            </div>
          ) : null}
          {quote.discountAmount > 0 ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-600">
                {i18n.resolve("host.v2.calendar.quote.savings", "Guest saves").text}
              </dt>
              <dd className="shrink-0 tabular-nums text-teal-700">
                {`−${format(quote.discountAmount)}`}
              </dd>
            </div>
          ) : null}
        </dl>
      </Disclosure>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Keep the shell's staged change in sync without making a freshly allocated
 * change object an effect dependency on every render. Cleanup belongs to the
 * editor lifetime, not to every keystroke.
 */
function useListingDraft(
  draft: ListingChange | null,
  onDraftChange: (change: ListingChange | null) => void,
) {
  useEffect(() => {
    onDraftChange(draft);
  }, [draft, onDraftChange]);

  useEffect(
    () => () => {
      onDraftChange(null);
    },
    [onDraftChange],
  );
}

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */

/**
 * The listing's own price, in the same shape as everything else in this panel.
 *
 * The percentage here is measured against the price that is *saved*, not against some
 * other rule — on this screen the base price is the thing being changed, so "against
 * base" would be circular and the middle preset says "now" rather than "base". It is a
 * way of typing a number and nothing more: what gets stored is the amount.
 *
 * This one still goes through the review dialog, unlike the date editors. A date price
 * touches the nights the host is looking at; this touches every date on the listing,
 * including ones months away that they are not.
 */
export function DefaultPricingEditor({
  listing,
  formats,
  today,
  focusMinimumStay,
  onDraftChange,
}: {
  listing: HostCalendarListing;
  formats: CalendarFormats;
  today: string;
  /** Arrived here from the date editor's minimum-stay link. */
  focusMinimumStay: boolean;
  onDraftChange: (change: ListingChange | null) => void;
}) {
  const i18n = useI18n();
  const saved = listing.pricing;
  const [baseRate, setBaseRate] = useState(saved?.baseNightlyRate ?? 0);
  const [baseDraft, setBaseDraft] = useState<string | null>(null);
  const [percentDraft, setPercentDraft] = useState<string | null>(null);
  const [cleaningFee, setCleaningFee] = useState(saved?.cleaningFee ?? 0);
  const [cleaningDraft, setCleaningDraft] = useState<string | null>(null);
  const [minNights, setMinNights] = useState(saved?.minNights ?? 1);
  const minNightsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusMinimumStay) {
      minNightsRef.current?.scrollIntoView({ block: "center" });
    }
  }, [focusMinimumStay]);

  const draft = useMemo(
    () =>
      defaultsDraft(
        {
          baseNightlyRate: String(baseRate),
          cleaningFee: String(cleaningFee),
          minNights: String(minNights),
        },
        listing,
      ),
    [baseRate, cleaningFee, minNights, listing],
  );
  useListingDraft(draft, onDraftChange);

  // Priced from the drafted rule so the example moves as the host types, using the
  // same engine the booking transaction uses. Nothing is recomputed here.
  const draftedPricing = saved
    ? { ...saved, baseNightlyRate: baseRate, cleaningFee, minNights }
    : null;
  const quote = useDefaultStayQuote({
    listing,
    today,
    pricing: draftedPricing,
    promotions: [],
    nights: minNights,
  });

  if (!saved) {
    return (
      <p className="text-[0.875rem] leading-5 text-slate-600">
        {
          i18n.resolve(
            "host.v2.calendar.no_pricing_hint",
            "Set a base price for this listing before pricing individual dates.",
          ).text
        }
      </p>
    );
  }

  const currency = saved.currency;
  const format = (amount: number) => money(amount, currency, formats);
  const symbol = currencySymbol(currency, formats);
  const percent = percentFromPrice(saved.baseNightlyRate, baseRate);
  const difference = Math.abs(baseRate - saved.baseNightlyRate);

  return (
    <div
      {...anchorProps(CALENDAR_ANCHOR.priceEditor)}
      className="flex flex-col gap-4"
    >
      <ColumnPair>
        <NumberColumn
          id="host-v2-base-price"
          label={
            i18n.resolve("host.v2.calendar.listing.base_price", "Base price").text
          }
          caption={
            i18n.resolve("host.v2.calendar.editor.per_night", "per night").text
          }
          value={baseDraft ?? String(baseRate)}
          prefix={symbol}
          onChange={(next) => {
            setBaseDraft(next);
            const parsed = wholeAmountFromInput(next);
            if (parsed !== null && parsed >= 1) setBaseRate(parsed);
          }}
          onBlur={() => setBaseDraft(null)}
        />
        <NumberColumn
          label={i18n.resolve("host.v2.calendar.listing.change", "Change").text}
          ariaLabel={
            i18n.resolve(
              "host.v2.calendar.listing.change_percent",
              "Percent against your saved base price",
            ).text
          }
          caption={
            difference === 0
              ? interpolate(
                  i18n.resolve(
                    "host.v2.calendar.listing.unchanged_from",
                    "of {amount}",
                  ),
                  { amount: format(saved.baseNightlyRate) },
                ).text
              : interpolate(
                  i18n.resolve("host.v2.calendar.listing.was", "was {amount}"),
                  { amount: format(saved.baseNightlyRate) },
                ).text
          }
          value={percentDraft ?? formatSignedPercent(percent)}
          suffix="%"
          accent={percent !== 0}
          onChange={(next) => {
            setPercentDraft(next);
            const raw = next.replace(/[−–]/g, "-").replace(/[^0-9.+-]/g, "");
            if (!/\d/.test(raw)) return;
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) {
              setBaseRate(priceFromPercent(saved.baseNightlyRate, parsed));
            }
          }}
          onBlur={() => setPercentDraft(null)}
        />
      </ColumnPair>

      <PanelSlider
        value={percent}
        min={PRICE_PERCENT_RANGE * -1}
        max={PRICE_PERCENT_RANGE}
        origin="center"
        presets={PRICE_PERCENT_PRESETS}
        label={
          i18n.resolve(
            "host.v2.calendar.listing.base_slider",
            "Change against your saved base price",
          ).text
        }
        onChange={(next) =>
          setBaseRate(priceFromPercent(saved.baseNightlyRate, next))
        }
        formatPreset={(value) =>
          value === 0
            ? i18n.resolve("host.v2.calendar.listing.preset_now", "Now").text
            : `${formatSignedPercent(value)}%`
        }
      />

      <div ref={minNightsRef} className="border-t border-slate-100 pt-4">
        <ColumnPair>
          <NumberColumn
            id="host-v2-cleaning-fee"
            label={
              i18n.resolve(
                "host.v2.calendar.listing.cleaning_fee",
                "Cleaning fee",
              ).text
            }
            caption={
              i18n.resolve("host.v2.calendar.listing.per_stay", "per stay").text
            }
            value={cleaningDraft ?? String(cleaningFee)}
            prefix={symbol}
            onChange={(next) => {
              setCleaningDraft(next);
              const parsed = wholeAmountFromInput(next);
              if (parsed !== null) {
                setCleaningFee(parsed);
              }
            }}
            onBlur={() => setCleaningDraft(null)}
          />
          <StepperColumn
            label={
              i18n.resolve(
                "host.v2.calendar.promotion_minimum",
                "Minimum stay",
              ).text
            }
            caption={
              minNights <= 1
                ? i18n.resolve(
                    "host.v2.calendar.listing.any_length",
                    "any length",
                  ).text
                : i18n.resolve(
                    "host.v2.calendar.listing.nights_minimum",
                    "nights minimum",
                  ).text
            }
            value={minNights}
            decrementLabel={
              i18n.resolve(
                "host.v2.calendar.promotion_fewer_nights",
                "Fewer nights",
              ).text
            }
            incrementLabel={
              i18n.resolve(
                "host.v2.calendar.promotion_more_nights",
                "More nights",
              ).text
            }
            onChange={setMinNights}
          />
        </ColumnPair>
      </div>

      <ExampleTotal
        quote={quote}
        currency={currency}
        formats={formats}
        nights={minNights}
        caption={
          interpolate(
            i18n.plural(
              "host.v2.calendar.listing.example_caption",
              minNights,
              "A {n}-night stay",
              "A {n}-night stay",
            ),
            {},
          ).text
        }
      />

      {/* What this screen reaches and what it deliberately does not. Both halves matter
          — the count is the warning, the second sentence is why — but the warning is
          said only to hosts who have dates it applies to. */}
      <p className="text-[0.75rem] leading-4 text-slate-500">
        {listing.datePrices.length > 0
          ? interpolate(
              i18n.plural(
                "host.v2.calendar.listing.custom_prices_kept",
                listing.datePrices.length,
                "{n} date you priced yourself will not change. Every other date follows this price.",
                "{n} dates you priced yourself will not change. Every other date follows this price.",
              ),
              {},
            ).text
          : i18n.resolve(
              "host.v2.calendar.listing.all_dates_follow",
              "Every date follows this price, unless you give a date its own.",
            ).text}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Every always-active offer, and one form pointed at whichever the host picked.
 *
 * It used to be one form pointed at whichever offer happened to be stored first, which
 * meant a second offer could not be created — saving always overwrote that one. This
 * view now exposes every current or upcoming offer and lets the host choose one to edit.
 *
 * The list states outcomes rather than settings: a row reads "10% off · 5–19 nights",
 * which is what a guest gets, not "10% off · 5 nights or more", which is what was typed.
 * With a longer-minimum offer sitting above it those are different sentences.
 */
export function OngoingPromotionEditor({
  listing,
  formats,
  today,
  promotionEditorId,
  mode,
  onModeChange,
  onDraftChange,
}: {
  listing: HostCalendarListing;
  formats: CalendarFormats;
  today: string;
  promotionEditorId: string | null;
  mode: OngoingPromotionMode;
  onModeChange: (mode: OngoingPromotionMode) => void;
  onDraftChange: (change: ListingChange | null) => void;
}) {
  const i18n = useI18n();
  // Seeded from the first saved promotion, including its rounding choice.
  const [form, setForm] = useState<OngoingPromotionForm>(() => {
    const target = promotionEditorId
      ? (listing.promotions.find(
          (promotion) => promotion.id === promotionEditorId,
        ) ?? null)
      : null;
    return ongoingPromotionFormOf(listing, target);
  });
  const currency = listing.pricing?.currency ?? BASE_CURRENCY;

  const saved = form.promotionId
    ? (listing.promotions.find(
        (promotion) => promotion.id === form.promotionId,
      ) ?? null)
    : null;

  const draft = useMemo(
    () => ongoingPromotionDraft(form, listing),
    [form, listing],
  );
  useListingDraft(mode === "list" ? null : draft, onDraftChange);

  // The shell owns the main CTA. When it changes list mode into create mode, prepare
  // a fresh form here; selecting an existing row prepares edit mode directly below.
  const previousMode = useRef(mode);
  useEffect(() => {
    if (mode === "create" && previousMode.current !== "create") {
      const taken = new Set(
        evergreenPromotions(listing).map(
          (promotion) => promotion.minimumNights ?? 1,
        ),
      );
      let next = 2;
      while (taken.has(next)) next += 1;
      setForm({
        discountPercent: "15",
        minimumNights: String(next),
        freeCleaning: false,
        roundToWholeUnit: true,
        removing: false,
      });
    }
    previousMode.current = mode;
  }, [listing, mode]);

  const percent = Number(form.discountPercent);
  const minimumNights = Number(form.minimumNights) || 1;
  const previewable =
    !form.removing &&
    ((Number.isFinite(percent) && percent > 0) || form.freeCleaning);

  const proposed: ProposedPromotion = {
    promotionId: form.promotionId,
    discountPercent: Number.isFinite(percent) ? percent : 0,
    minimumNights,
    freeCleaning: form.freeCleaning,
    roundToWholeUnit: percent > 0 && form.roundToWholeUnit,
  };
  const clash = form.removing
    ? null
    : evergreenMinimumClash({ listing, draft: proposed });

  const quote = useDefaultStayQuote({
    listing,
    today,
    pricing: listing.pricing,
    promotions: previewable
      ? [
          {
            id: saved?.id ?? "draft",
            type:
              form.freeCleaning && percent <= 0
                ? "FREE_CLEANING"
                : "PERCENT_DISCOUNT",
            discountPercent: Number.isFinite(percent) ? percent : 0,
            minimumNights,
            freeCleaning: form.freeCleaning,
            roundToWholeUnit: percent > 0 && form.roundToWholeUnit,
            startDate: null,
            endDate: null,
            createdAt: saved?.createdAt ?? new Date(0).toISOString(),
          },
        ]
      : [],
    nights: minimumNights,
  });

  if (!listing.pricing) {
    return (
      <p className="text-[0.875rem] leading-5 text-slate-600">
        {
          i18n.resolve(
            "host.v2.calendar.no_pricing_hint",
            "Set a base price for this listing before pricing individual dates.",
          ).text
        }
      </p>
    );
  }

  if (form.removing && saved) {
    return (
      <div
        {...anchorProps(CALENDAR_ANCHOR.promotionEditor)}
        className="flex flex-col gap-4"
      >
        <ConsequenceLine tone="warning">
          {
            i18n.resolve(
              "host.v2.calendar.listing.removing_ongoing",
              "This promotion will stop applying to new bookings when you confirm. Existing bookings keep what guests already agreed.",
            ).text
          }
        </ConsequenceLine>
        <button
          type="button"
          onClick={() => setForm({ ...form, removing: false })}
          className="min-h-11 self-start rounded-lg bg-slate-50 px-3 text-[0.8125rem] font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
        >
          {
            i18n.resolve(
              "host.v2.calendar.editor.keep_promotion",
              "Keep this promotion",
            ).text
          }
        </button>
      </div>
    );
  }

  /** Point the form at the saved promotion the host selected. */
  const editOffer = (promotionId: string) => {
    const target =
      listing.promotions.find((promotion) => promotion.id === promotionId) ??
      null;
    setForm(ongoingPromotionFormOf(listing, target));
    onModeChange("edit");
  };
  const ongoingPromotions = evergreenPromotions(listing);
  const visiblePromotionCount = ongoingPromotions.length;

  return (
    <div
      {...anchorProps(CALENDAR_ANCHOR.promotionEditor)}
      className="flex flex-col gap-4"
    >
      {mode === "list" ? (
        <AllPromotionsOverview
          promotions={ongoingPromotions}
          today={today}
          formats={formats}
          onSelect={(promotion) => editOffer(promotion.id)}
        />
      ) : (
        <button
          type="button"
          onClick={() => onModeChange("list")}
          className="flex min-h-10 w-full items-center justify-between rounded-lg bg-slate-50 px-3 text-left text-[0.8125rem] font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a]"
        >
          <span>
            {
              interpolate(
                i18n.plural(
                  "host.v2.calendar.listing.view_promotions_count",
                  visiblePromotionCount,
                  "View {n} promotion",
                  "View {n} promotions",
                ),
                {},
              ).text
            }
          </span>
          <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      )}

      {mode !== "list" ? (
        <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-[0.8125rem] font-semibold text-slate-900">
              {saved
                ? interpolate(
                    i18n.resolve(
                      "host.v2.calendar.listing.editing_promotion",
                      "Editing {percent}% promotion",
                    ),
                    { percent: saved.discountPercent },
                  ).text
                : i18n.resolve(
                    "host.v2.calendar.listing.new_promotion",
                    "New promotion",
                  ).text}
            </h4>
            <button
              type="button"
              onClick={() => onModeChange("list")}
              className="min-h-9 text-[0.75rem] font-semibold text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
            >
              {i18n.resolve("host.v2.calendar.cancel", "Cancel").text}
            </button>
          </div>

        <ColumnPair>
          <NumberColumn
            id="host-v2-ongoing-percent"
            label={
              i18n.resolve("host.v2.calendar.promotion_percent", "Discount").text
            }
            caption={i18n.resolve("host.v2.calendar.promotion_off", "off").text}
            value={form.discountPercent}
            suffix="%"
            onChange={(next) =>
              setForm({
                ...form,
                discountPercent: String(
                  Math.min(50, wholeAmountFromInput(next) ?? 0),
                ),
              })
            }
          />
          <StepperColumn
            label={
              i18n.resolve(
                "host.v2.calendar.promotion_minimum",
                "Minimum stay",
              ).text
            }
            caption={
              minimumNights <= 1
                ? i18n.resolve(
                    "host.v2.calendar.promotion_every_stay",
                    "every stay",
                  ).text
                : i18n.resolve(
                    "host.v2.calendar.promotion_nights_or_more",
                    "nights or more",
                  ).text
            }
            value={minimumNights}
            decrementLabel={
              i18n.resolve(
                "host.v2.calendar.promotion_fewer_nights",
                "Fewer nights",
              ).text
            }
            incrementLabel={
              i18n.resolve(
                "host.v2.calendar.promotion_more_nights",
                "More nights",
              ).text
            }
            onChange={(next) =>
              setForm({ ...form, minimumNights: String(next) })
            }
          />
        </ColumnPair>

        <PanelSlider
          value={Number.isFinite(percent) ? percent : 0}
          min={0}
          max={50}
          origin="start"
          presets={QUICK_DISCOUNTS}
          label={
            i18n.resolve(
              "host.v2.calendar.editor.discount_slider",
              "Discount percent",
            ).text
          }
          onChange={(next) =>
            setForm({ ...form, discountPercent: String(next) })
          }
          formatPreset={(value) => `${value}%`}
        />

        {/* Beside the slider, not behind a disclosure: waiving the fee moves what a
            guest pays by an amount the host is weighing against the percentage, and a
            choice they cannot see while making the other one is a choice they make
            twice. */}
        {listing.pricing.cleaningFee > 0 ? (
          <ToggleRow
            checked={form.freeCleaning}
            onChange={(next) => setForm({ ...form, freeCleaning: next })}
            label={
              i18n.resolve(
                "host.v2.calendar.promotion_free_cleaning",
                "Also waive the cleaning fee",
              ).text
            }
            description={
              interpolate(
                i18n.resolve(
                  "host.v2.calendar.promotion_free_cleaning_hint",
                  "Guests save a further {amount}",
                ),
                {
                  amount: money(
                    listing.pricing.cleaningFee,
                    currency,
                    formats,
                  ),
                },
              ).text
            }
          />
        ) : null}

        <ToggleRow
          checked={
            Number.isFinite(percent) && percent > 0 && form.roundToWholeUnit
          }
          disabled={!Number.isFinite(percent) || percent <= 0}
          onChange={(next) => setForm({ ...form, roundToWholeUnit: next })}
          label={
            i18n.resolve(
              "host.v2.calendar.promotion_round",
              "Round discounted nightly prices",
            ).text
          }
          description={
            i18n.resolve(
              "host.v2.calendar.promotion_round_hint",
              "Round each discounted night to the nearest whole amount",
            ).text
          }
        />

        {/* Overlap is valid, but worth making visible before the host saves. */}
        {clash ? (
          <ConsequenceLine tone="warning">
            {
              interpolate(
                i18n.resolve(
                  "host.v2.calendar.listing.minimum_taken",
                  "Another {percent}% promotion starts at {nights} nights. Both can run; the promotion that saves the guest more will win.",
                ),
                {
                  percent: clash.discountPercent,
                  nights: clash.minimumNights ?? 1,
                },
              ).text
            }
          </ConsequenceLine>
        ) : null}

        {previewable ? (
          <ExampleTotal
            quote={quote}
            currency={currency}
            formats={formats}
            nights={minimumNights}
            caption={
              interpolate(
                i18n.plural(
                  "host.v2.calendar.listing.example_offer_caption",
                  minimumNights,
                  "A {n}-night stay with this promotion",
                  "A {n}-night stay with this promotion",
                ),
                {},
              ).text
            }
          />
        ) : null}

        {/* Removal is its own decision, staged rather than done — the shell's action
            becomes "Review removal" and the confirmation names what it will end. */}
        {saved ? (
          <button
            type="button"
            onClick={() => setForm({ ...form, removing: true })}
            className="min-h-11 self-start text-[0.8125rem] font-semibold text-red-700 underline underline-offset-2 transition-colors duration-150 hover:text-red-800 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            {
              i18n.resolve(
                "host.v2.calendar.listing.remove_ongoing",
                "Remove this promotion",
              ).text
            }
          </button>
        ) : null}
        </div>
      ) : null}

      <div className="border-t border-slate-100 pt-3">
        <HowOffersWork />
      </div>
    </div>
  );
}

export type OngoingPromotionMode = "list" | "create" | "edit";
