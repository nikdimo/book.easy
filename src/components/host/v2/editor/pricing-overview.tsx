import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { hostCalendarHref, type CalendarIntent } from "@/lib/host/v2/calendar-href";
import { T, ti, tPlural, type Resolved, type Translator } from "@/lib/i18n/t";
import type {
  ListingPricingSummary,
  PricingSummaryPromotion,
} from "@/lib/host/v2/pricing-summary";
import { HowOffersWorkButton } from "@/components/host/v2/calendar/promotion-help";
import { PricingTabs } from "@/components/host/v2/editor/pricing-tabs";
import { addDaysToYmd, ymdToDbDate } from "@/lib/utils/date-only";

/**
 * The editor's Pricing section: the listing's own prices, and a way to the rest.
 *
 * This page owns the money that applies to the listing as a whole — the base nightly
 * price, the cleaning fee and the offers that run on every date. Those live in the
 * client editors passed in as `defaultsEditor` and `offersEditor`; what is written here
 * is the part that is only ever reported, because it belongs to particular dates and the
 * calendar owns those.
 *
 * Money is all it owns. How long a guest may stay is a booking rule rather than an
 * amount, so the minimum and the maximum stay are set — and shown — under
 * Availability → Booking rules, and nothing on this page edits or restates them.
 *
 * The split is what stops one number having two answers. Nothing on this page edits a
 * date-specific price or a dated offer, and nothing in the calendar edits what is above.
 * Each side shows the other's values and links to it, naming the job rather than the
 * screen: "Set prices for specific dates", not "Open calendar".
 *
 * The layout is two tabs rather than one scrolling column of bordered cards. Four rings
 * stacked on one screen made nothing look more important than anything else, and the
 * offers — a whole half of what this page does — sat in the third of them, below the
 * fold, where a host could use the page for months without discovering that a promotion
 * is created here. `PricingTabs` puts both halves at the top and counts the offers in
 * the tab's own label. Everything that used to be a card is now a section of a panel:
 * the pane is the container, and it does not need a box drawn around it.
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

/**
 * The one line at the foot of a panel that leaves for the calendar.
 *
 * This replaces a bordered "Particular dates" section that spent two icons, two
 * paragraphs and two pill buttons on what is, in both cases, a link and a count. The
 * link names the job rather than the screen — the whole reason the split between this
 * page and the calendar is legible — and the count under it is the only part of the old
 * report a host could not have guessed.
 */
function DateWorkRow({
  href,
  label,
  detail,
}: {
  href: string;
  label: React.ReactNode;
  detail?: Resolved | null;
}) {
  return (
    <Link
      href={href}
      className="mt-6 flex min-h-11 items-center justify-between gap-3 border-t border-[var(--ag-deco)] pt-4 text-[var(--ag-hof)] transition-colors hover:text-[var(--ag-foggy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ag-hof)]"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-[1.125rem]">
          {label}
        </span>
        {detail ? (
          <span
            className="mt-1 block text-[0.75rem] leading-4 text-[var(--ag-foggy)]"
            translate={detail.translated ? "no" : undefined}
          >
            {detail.text}
          </span>
        ) : null}
      </span>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}

/** The one sentence a panel gets. */
function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm leading-[1.25rem] text-[var(--ag-foggy)]">{children}</p>
  );
}

export function PricingOverview({
  summary,
  defaultsEditor,
  offersEditor,
  t,
}: {
  summary: ListingPricingSummary;
  /** The editable base price and cleaning fee. Nothing about stay length. */
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

  /* Named by the rail, the browser tab and the active chip on a phone. Kept in the
     outline for screen readers, which have no rail to read. */
  const heading = (
    <h2 className="sr-only">
      <T t={t} k="host.editor.section.pricing" source="Pricing" />
    </h2>
  );

  // No price, no tabs. A listing without a pricing rule has no offers to run and
  // nothing for the calendar to report, so the whole screen is the one form that asks
  // for a first price — a tab strip over a single empty panel would be furniture.
  if (!rule) {
    return (
      <div className="mx-auto w-full max-w-2xl py-6 md:py-10">
        {heading}
        {defaultsEditor}
      </div>
    );
  }

  const pricePanel = (
    <>
      <Lead>
        <T
          t={t}
          k="host.editor.pricing.defaults_lead"
          source="What a night costs and what cleaning costs, unless a particular date says otherwise."
        />
      </Lead>
      {defaultsEditor}
      <DateWorkRow
        href={calendarPricingHref(summary.listingId, "pricing")}
        label={
          <T
            t={t}
            k="host.editor.pricing.dates_cta"
            source="Set prices for specific dates"
          />
        }
        detail={
          summary.datePriceRange
            ? ti(
                t,
                "host.editor.pricing.date_prices_count",
                "{count} dates already have a price of their own, {from} – {to}.",
                {
                  count: summary.datePriceCount,
                  from: formatYmd(summary.datePriceRange.from, locale),
                  to: formatYmd(summary.datePriceRange.to, locale),
                },
              )
            : null
        }
      />
      {/* The one piece of context the host cannot change from here, said in a line
          rather than in a bordered section with a heading of its own: every input on
          this panel already prints the symbol, so this only has to name it. Stay length
          is deliberately not stated beside it — how long a guest may stay is a booking
          rule, it is read and edited under Availability → Booking rules, and repeating
          it on the money screen is how a host ends up believing Pricing is where it is
          changed. */}
      <p className="mt-4 text-[0.75rem] leading-4 text-[var(--ag-foggy)]">
        <T t={t} k="host.editor.pricing.currency" source="Currency" />
        {" · "}
        <span className="notranslate" translate="no">
          {rule.currency}
        </span>
      </p>
    </>
  );

  const promotionsPanel = (
    <>
      {/* The "?" sits on the sentence that raises the question rather than under the
          controls, and it opens a dialog rather than pushing the form down. The rules
          about which offer wins a night are worth one press when a host wonders; they
          are not worth six permanently expanded bullets above the thing they came to
          change. */}
      <Lead>
        <T
          t={t}
          k="host.editor.pricing.offers_lead_short"
          source="Discounts that run on every date until you end them."
        />
        <HowOffersWorkButton />
      </Lead>
      {offersEditor}

      {/* Dated offers are the calendar's to edit and this page's to show. They are a
          list of real offers rather than a paragraph about offers, so nothing is said
          when there are none — the link below already offers to make one. */}
      {datedPromotions.length > 0 && (
        <ul className="mt-5 flex flex-col gap-1">
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
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-[0.8125rem] transition-colors hover:bg-[var(--ag-faint)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ag-hof)]"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className="font-medium text-[var(--ag-hof)]"
                      translate={headline.translated ? "no" : undefined}
                    >
                      {headline.text}
                    </span>
                    <span
                      className="ml-2 text-[var(--ag-foggy)]"
                      translate={phase.translated ? "no" : undefined}
                    >
                      {phase.text}
                    </span>
                    <span
                      className="mt-0.5 block text-[var(--ag-foggy)]"
                      translate={detail.translated ? "no" : undefined}
                    >
                      {detail.text}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-[var(--ag-bobo)]"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <DateWorkRow
        href={calendarPricingHref(summary.listingId, "promotion")}
        label={
          <T
            t={t}
            k="host.editor.pricing.dated_offer_cta"
            source="Create a date-based offer"
          />
        }
      />
    </>
  );

  return (
    <div className="mx-auto w-full max-w-2xl py-6 md:py-10">
      {heading}
      <PricingTabs
        groupLabel={
          t.resolve("host.editor.pricing.tabs_label", "Pricing sections").text
        }
        priceLabel={t.resolve("host.editor.pricing.tab_price", "Price").text}
        promotionsLabel={
          t.resolve("host.editor.pricing.tab_promotions", "Promotions").text
        }
        promotionCount={
          summary.activePromotionCount + summary.upcomingPromotionCount
        }
        price={pricePanel}
        promotions={promotionsPanel}
      />
    </div>
  );
}
