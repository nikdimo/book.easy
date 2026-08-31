import Link from "next/link";
import { ArrowRight, CalendarRange, Tag } from "lucide-react";
import { hostCalendarHref, type CalendarIntent } from "@/lib/host/v2/calendar-href";
import { T, ti, tPlural, type Resolved, type Translator } from "@/lib/i18n/t";
import type {
  ListingPricingSummary,
  PricingSummaryPromotion,
} from "@/lib/host/v2/pricing-summary";
import { addDaysToYmd, ymdToDbDate } from "@/lib/utils/date-only";

/**
 * The editor's Pricing section: the listing's own prices, and a way to the rest.
 *
 * This page owns everything that applies to the listing as a whole — the base nightly
 * price, the cleaning fee, the minimum stay and the offers that run on every date. Those
 * live in the client editors passed in as `defaultsEditor` and `offersEditor`; what is
 * written here is the part that is only ever reported, because it belongs to particular
 * dates and the calendar owns those.
 *
 * The split is what stops one number having two answers. Nothing on this page edits a
 * date-specific price or a dated offer, and nothing in the calendar edits what is above.
 * Each side shows the other's values and links to it, naming the job rather than the
 * screen: "Set prices for specific dates", not "Open calendar".
 */

/**
 * The Calendar deep link for a pricing job.
 *
 * An alias for the shared builder rather than a second copy of the path, and it now
 * carries the intent: a host who followed "set prices for specific dates" arrives at a
 * calendar asking which dates, not at a menu that has forgotten why they came.
 */
export function calendarPricingHref(
  listingId: string,
  intent: CalendarIntent = "pricing",
): string {
  return hostCalendarHref(listingId, { intent });
}

/**
 * A dated offer, opened where it is edited.
 *
 * The offer's own nights travel with the link, so the calendar selects exactly the run
 * it applies to. Stored ends are exclusive, so the last covered night is the day before.
 */
export function datedPromotionHref(
  listingId: string,
  promotion: PricingSummaryPromotion,
): string {
  return promotion.startDate && promotion.endDate
    ? hostCalendarHref(listingId, {
        intent: "promotion",
        range: {
          from: promotion.startDate,
          to: addDaysToYmd(promotion.endDate, -1),
        },
      })
    : hostCalendarHref(listingId, { intent: "promotion" });
}

function formatYmd(ymd: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(ymdToDbDate(ymd));
  } catch {
    return ymd;
  }
}

function promotionHeadline(
  t: Translator,
  promotion: PricingSummaryPromotion,
): Resolved {
  if (promotion.type === "FREE_CLEANING" || promotion.discountPercent === 0) {
    return t.resolve("host.editor.pricing.promo.free_cleaning", "Free cleaning");
  }
  return ti(t, "host.editor.pricing.promo.percent_off", "{percent}% off", {
    percent: promotion.discountPercent,
  });
}

/** The one-line conditions under an offer: when it runs, and what it asks for. */
function promotionDetail(
  t: Translator,
  promotion: PricingSummaryPromotion,
): Resolved {
  const parts: Resolved[] = [];

  if (promotion.startDate && promotion.endDate) {
    parts.push(
      ti(t, "host.editor.pricing.promo.window", "{from} – {to}", {
        from: formatYmd(promotion.startDate, t.locale),
        to: formatYmd(addDaysToYmd(promotion.endDate, -1), t.locale),
      }),
    );
  } else if (promotion.startDate) {
    parts.push(
      ti(t, "host.editor.pricing.promo.from", "From {from}", {
        from: formatYmd(promotion.startDate, t.locale),
      }),
    );
  } else if (promotion.endDate) {
    parts.push(
      ti(t, "host.editor.pricing.promo.until", "Until {to}", {
        to: formatYmd(addDaysToYmd(promotion.endDate, -1), t.locale),
      }),
    );
  } else {
    parts.push(t.resolve("host.editor.pricing.promo.all_dates", "All dates"));
  }

  if (promotion.minimumNights && promotion.minimumNights > 1) {
    parts.push(
      tPlural(
        t,
        "host.editor.pricing.promo.min_nights",
        promotion.minimumNights,
        "stays of {n} night or more",
        "stays of {n} nights or more",
      ),
    );
  }

  if (promotion.freeCleaning && promotion.type !== "FREE_CLEANING") {
    parts.push(
      t.resolve(
        "host.editor.pricing.promo.plus_free_cleaning",
        "free cleaning included",
      ),
    );
  }

  return {
    text: parts.map((part) => part.text).join(" · "),
    translated: parts.every((part) => part.translated),
  };
}

function Row({ label, children }: { label: Resolved; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
      <dt
        className="text-sm text-slate-600"
        translate={label.translated ? "no" : undefined}
      >
        {label.text}
      </dt>
      <dd className="text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/** A contextual link that says what it will let the host do. */
function DateWorkLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f1f5f9] px-5 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#e2e8f0] focus-visible:bg-[#e2e8f0] focus-visible:outline-none"
    >
      {children}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

export function PricingOverview({
  summary,
  defaultsEditor,
  offersEditor,
  t,
}: {
  summary: ListingPricingSummary;
  /** The editable base price, cleaning fee and minimum stay. */
  defaultsEditor: React.ReactNode;
  /**
   * The editable always-active offers.
   *
   * Withheld when the listing has no pricing rule: an offer discounts a price, and
   * there is no price yet to discount. The defaults editor asks for one first.
   */
  offersEditor: React.ReactNode;
  t: Translator;
}) {
  const { rule, promotions } = summary;
  const locale = t.locale;
  const datedPromotions = promotions.filter(
    (promotion) => promotion.startDate || promotion.endDate,
  );

  return (
    <div className="mx-auto w-full max-w-2xl py-6 md:py-10">
      {/* Named by the rail, the browser tab and the active chip on a phone. Kept in the
          outline for screen readers, which have no rail to read. */}
      <header>
        <h2 className="sr-only">
          <T t={t} k="host.editor.section.pricing" source="Pricing" />
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          <T
            t={t}
            k="host.editor.pricing.intro"
            source="Set what this listing charges by default here. Prices for particular dates are set on the calendar."
          />
        </p>
      </header>

      {defaultsEditor}
      {rule ? offersEditor : null}

      {/* Context the host cannot change from here, and never could: the currency every
          amount is authored in, and the longest stay the listing accepts. Stated
          because the numbers above are read against them — a minimum stay is only
          meaningful next to the maximum it cannot exceed. */}
      {rule && (
        <section
          aria-labelledby="pricing-context-heading"
          className="mt-4 rounded-2xl border border-slate-200 p-5"
        >
          <h3
            id="pricing-context-heading"
            className="text-sm font-semibold text-slate-900"
          >
            <T
              t={t}
              k="host.editor.pricing.context_heading"
              source="Fixed for this listing"
            />
          </h3>
          <dl className="mt-2">
            <Row label={t.resolve("host.editor.pricing.currency", "Currency")}>
              <span className="notranslate" translate="no">
                {rule.currency}
              </span>
            </Row>
            <Row label={t.resolve("host.editor.pricing.max_stay", "Maximum stay")}>
              {
                tPlural(
                  t,
                  "host.editor.pricing.nights",
                  rule.maxNights,
                  "{n} night",
                  "{n} nights",
                ).text
              }
            </Row>
          </dl>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            <T
              t={t}
              k="host.editor.pricing.context_note"
              source="Every amount on this listing is set in this currency. Contact support to change either of these."
            />
          </p>
        </section>
      )}

      {/* Everything below belongs to particular dates. It is reported here so a host
          can see the whole picture of what their listing charges, and each block hands
          off to the calendar naming the job rather than the screen. */}
      <section
        aria-labelledby="pricing-dates-heading"
        className="mt-4 rounded-2xl border border-slate-200 p-5"
      >
        <h3
          id="pricing-dates-heading"
          className="text-sm font-semibold text-slate-900"
        >
          <T
            t={t}
            k="host.editor.pricing.dates_heading"
            source="Particular dates"
          />
        </h3>

        <div className="mt-4 flex gap-3">
          <CalendarRange className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              <T
                t={t}
                k="host.editor.pricing.date_prices_label"
                source="Date-specific prices"
              />
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {summary.datePriceRange
                ? ti(
                    t,
                    "host.editor.pricing.date_prices_set",
                    "{count} upcoming nights carry a price of their own, between {from} and {to}.",
                    {
                      count: summary.datePriceCount,
                      from: formatYmd(summary.datePriceRange.from, locale),
                      to: formatYmd(summary.datePriceRange.to, locale),
                    },
                  ).text
                : t.resolve(
                    "host.editor.pricing.date_prices_none",
                    "No dates are priced differently. Every night is charged at the base rate.",
                  ).text}
            </p>
            <div className="mt-3">
              <DateWorkLink href={calendarPricingHref(summary.listingId, "pricing")}>
                <T
                  t={t}
                  k="host.editor.pricing.dates_cta"
                  source="Set prices for specific dates"
                />
              </DateWorkLink>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Tag className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              <T
                t={t}
                k="host.editor.pricing.dated_promotions_label"
                source="Date-based offers"
              />
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {datedPromotions.length === 0
                ? t.resolve(
                    "host.editor.pricing.dated_promotions_none",
                    "No offer is running for particular dates.",
                  ).text
                : t.resolve(
                    "host.editor.pricing.dated_promotions_some",
                    "These run only on the dates they were created for. Open one to change it on the calendar.",
                  ).text}
            </p>
            {datedPromotions.length > 0 && (
              <ul className="mt-3 space-y-2">
                {datedPromotions.map((promotion) => {
                  const headline = promotionHeadline(t, promotion);
                  const detail = promotionDetail(t, promotion);
                  const phase =
                    promotion.phase === "ACTIVE"
                      ? t.resolve("host.editor.pricing.promo.running", "Running now")
                      : t.resolve("host.editor.pricing.promo.scheduled", "Scheduled");
                  return (
                    <li key={promotion.id}>
                      <Link
                        href={datedPromotionHref(summary.listingId, promotion)}
                        className="flex min-h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className="font-medium text-slate-900"
                            translate={headline.translated ? "no" : undefined}
                          >
                            {headline.text}
                          </span>
                          <span
                            className="ml-2 text-slate-600"
                            translate={phase.translated ? "no" : undefined}
                          >
                            {phase.text}
                          </span>
                          <span
                            className="mt-0.5 block text-slate-600"
                            translate={detail.translated ? "no" : undefined}
                          >
                            {detail.text}
                          </span>
                        </span>
                        <ArrowRight
                          className="size-4 shrink-0 text-slate-400"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3">
              <DateWorkLink
                href={calendarPricingHref(summary.listingId, "promotion")}
              >
                <T
                  t={t}
                  k="host.editor.pricing.dated_offer_cta"
                  source="Create a date-based offer"
                />
              </DateWorkLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
