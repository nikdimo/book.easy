import Link from "next/link";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import { ArrowRight, CalendarRange, Tag } from "lucide-react";
import { formatMoney } from "@/lib/currency/convert";
import { hostCalendarHref } from "@/lib/host/v2/calendar-href";
import { T, ti, tPlural, type Resolved, type Translator } from "@/lib/i18n/t";
import type {
  ListingPricingSummary,
  PricingSummaryPromotion,
} from "@/lib/host/v2/pricing-summary";
import { addDaysToYmd, ymdToDbDate } from "@/lib/utils/date-only";

/**
 * The editor's Pricing section: a summary, not an editor.
 *
 * Calendar owns every price on this listing — the base rate, the nights that cost
 * something different, and the offers. Duplicating any of that here would give a host
 * two places to change one number and two answers when they disagree, so this pane
 * reads the current values and hands over. There are no inputs and no actions in it
 * beyond the link to the screen that does the work.
 */

/** The Calendar deep link, so it opens on this listing rather than on whichever one the
 *  workspace happened to have selected last. An alias for the shared builder rather
 *  than a second copy of the path. */
export function calendarPricingHref(listingId: string): string {
  return hostCalendarHref(listingId);
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

export function PricingOverview({
  summary,
  t,
}: {
  summary: ListingPricingSummary;
  t: Translator;
}) {
  const { rule, promotions } = summary;
  const locale = t.locale;
  const money = (amount: number) =>
    formatMoney(amount, rule?.currency ?? BASE_CURRENCY, locale);

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
            source="What this listing charges today. Prices are set and changed in Calendar."
          />
        </p>
      </header>

      <section
        aria-labelledby="pricing-current-heading"
        className="mt-6 rounded-2xl border border-slate-200 p-5"
      >
        <h3
          id="pricing-current-heading"
          className="text-sm font-semibold text-slate-900"
        >
          <T t={t} k="host.editor.pricing.current_heading" source="Current pricing" />
        </h3>

        {rule ? (
          <dl className="mt-2">
            <Row label={t.resolve("host.editor.pricing.currency", "Currency")}>
              <span className="notranslate" translate="no">
                {rule.currency}
              </span>
            </Row>
            <Row
              label={t.resolve("host.editor.pricing.base_rate", "Base nightly rate")}
            >
              <span className="notranslate" translate="no">
                {money(rule.baseNightlyRate)}
              </span>
            </Row>
            <Row label={t.resolve("host.editor.pricing.cleaning_fee", "Cleaning fee")}>
              <span className="notranslate" translate="no">
                {money(rule.cleaningFee)}
              </span>
            </Row>
            <Row label={t.resolve("host.editor.pricing.min_stay", "Minimum stay")}>
              {
                tPlural(
                  t,
                  "host.editor.pricing.nights",
                  rule.minNights,
                  "{n} night",
                  "{n} nights",
                ).text
              }
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
        ) : (
          // A listing can reach this section before anyone has opened Calendar for it.
          // Saying so plainly beats rendering zeroes that read like a real price.
          <p className="mt-2 text-sm leading-6 text-slate-600">
            <T
              t={t}
              k="host.editor.pricing.no_rule"
              source="No prices have been set for this listing yet. Open Calendar to set a nightly rate before you publish."
            />
          </p>
        )}
      </section>

      <section
        aria-labelledby="pricing-extras-heading"
        className="mt-4 rounded-2xl border border-slate-200 p-5"
      >
        <h3
          id="pricing-extras-heading"
          className="text-sm font-semibold text-slate-900"
        >
          <T
            t={t}
            k="host.editor.pricing.extras_heading"
            source="On top of the base price"
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
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <Tag className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              <T t={t} k="host.editor.pricing.promotions_label" source="Promotions" />
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {promotions.length === 0
                ? t.resolve(
                    "host.editor.pricing.promotions_none",
                    "No promotions are running or scheduled.",
                  ).text
                : ti(
                    t,
                    "host.editor.pricing.promotions_count",
                    "{active} running now, {upcoming} scheduled.",
                    {
                      active: summary.activePromotionCount,
                      upcoming: summary.upcomingPromotionCount,
                    },
                  ).text}
            </p>
            {promotions.length > 0 && (
              <ul className="mt-3 space-y-2">
                {promotions.map((promotion) => {
                  const headline = promotionHeadline(t, promotion);
                  const detail = promotionDetail(t, promotion);
                  const phase =
                    promotion.phase === "ACTIVE"
                      ? t.resolve("host.editor.pricing.promo.running", "Running now")
                      : t.resolve("host.editor.pricing.promo.scheduled", "Scheduled");
                  return (
                    <li
                      key={promotion.id}
                      className="rounded-xl bg-slate-50 px-3 py-2 text-sm"
                    >
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
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="pricing-handoff-heading"
        className="mt-4 rounded-2xl bg-slate-50 p-5"
      >
        <h3
          id="pricing-handoff-heading"
          className="text-sm font-semibold text-slate-900"
        >
          <T
            t={t}
            k="host.editor.pricing.handoff_heading"
            source="Where pricing is changed"
          />
        </h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          <li>
            <T
              t={t}
              k="host.editor.pricing.handoff_base"
              source="The base nightly rate applies to every night unless that date says otherwise."
            />
          </li>
          <li>
            <T
              t={t}
              k="host.editor.pricing.handoff_dates"
              source="To charge more or less for particular nights, select those dates in Calendar and give them their own price."
            />
          </li>
          <li>
            <T
              t={t}
              k="host.editor.pricing.handoff_promotions"
              source="Promotions are created and ended in Calendar as well, so one screen decides what a guest pays."
            />
          </li>
        </ul>
        <Link
          href={calendarPricingHref(summary.listingId)}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f1f5f9] px-5 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#e2e8f0] focus-visible:bg-[#e2e8f0] focus-visible:outline-none"
        >
          <T
            t={t}
            k="host.editor.pricing.manage_cta"
            source="Manage pricing in Calendar"
          />
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
