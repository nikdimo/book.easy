import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock,
  Link2,
} from "lucide-react";
import {
  calendarHrefForListing,
  type AvailabilityBlockPeriod,
  type AvailabilityPeriod,
  type CalendarFeedHealth,
  type ConnectedCalendarSummary,
  type ListingAvailabilityOverview,
} from "@/lib/host/v2/availability-overview";
import { PLATFORM_LABEL } from "@/lib/host/v2/calendar-feed-platform";
import type { HostListingVisibility } from "@/lib/host/v2/listing-status";
import { T, t as text, ti, tPlural, type Translator } from "@/lib/i18n/t";
import { resolveListingStatus } from "@/lib/i18n/status-labels";
import { ymdToLocalDate } from "@/lib/utils/date-only";

/**
 * Availability: the listing's default, and then what has been done to particular dates.
 *
 * The division of labour is the whole design. This page owns the one setting that
 * belongs to the listing — how a future date starts out — and the Calendar owns every
 * decision about specific dates. Each setting therefore has exactly one editable home,
 * and the other surface shows it and links here.
 *
 * The editable part is a client component passed in as `defaultsEditor`; everything
 * below it is a report. That report is still rendered on the server, so dates are
 * formatted with the server's full ICU data and shipped as finished text — there is no
 * client component underneath to re-resolve the locale against whatever data the
 * browser happens to ship, which is the hydration mismatch the Calendar's format
 * snapshots exist to avoid.
 *
 * It is deliberately not counted as an editor step. Every listing already has a stored
 * default, so there is no state in which this section is "unfinished", and a checkmark
 * for having visited it would inflate progress the host is trying to read honestly.
 */

/** Long enough to be unambiguous, short enough for two of them to sit on one line. */
function formatDay(ymd: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(ymdToLocalDate(ymd));
}

/**
 * A period as its first and last covered day.
 *
 * `lastDate` is already the inclusive end (the summarizer derives it from the stored
 * exclusive one), so a single night collapses to one date rather than reading as two.
 */
function formatPeriod(period: AvailabilityPeriod, locale: string): string {
  const from = formatDay(period.startDate, locale);
  if (period.startDate === period.lastDate) return from;
  return `${from} – ${formatDay(period.lastDate, locale)}`;
}

function formatSyncedAt(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** What each state of the listing means for whether guests can see it at all. */
function visibilityNote(t: Translator, visibility: HostListingVisibility): string {
  switch (visibility) {
    case "LIVE":
      return text(
        t,
        "host.editor.availability.visibility_live",
        "Published to guests. Whether a stay can be booked also depends on its dates and pricing.",
      );
    case "HIDDEN":
      return text(t, "host.editor.availability.visibility_hidden", "Hidden from guests. Availability is kept and applies again once it is published.");
    case "SUSPENDED":
      return text(t, "host.editor.availability.visibility_suspended", "Suspended by support, so no date can be booked.");
    case "ARCHIVED":
      return text(t, "host.editor.availability.visibility_archived", "Archived and no longer bookable.");
    default:
      return text(t, "host.editor.availability.visibility_draft", "Still a draft. Availability applies once it is published.");
  }
}

const HEALTH_STYLE: Record<CalendarFeedHealth, string> = {
  OK: "text-emerald-700",
  ERROR: "text-rose-700",
  PENDING: "text-slate-500",
};

function healthLabel(t: Translator, calendar: ConnectedCalendarSummary): string {
  if (calendar.health === "ERROR") {
    return text(t, "host.editor.availability.feed_error", "Last sync failed");
  }
  if (calendar.health === "PENDING") {
    return text(t, "host.editor.availability.feed_pending", "Waiting for its first sync");
  }
  return calendar.lastSyncedAt
    ? ti(t, "host.editor.availability.feed_synced", "Synced {when}", {
        when: formatSyncedAt(calendar.lastSyncedAt, t.locale),
      }).text
    : text(t, "host.editor.availability.feed_ok", "Syncing normally");
}

/** One labelled fact. Four of these are the whole summary a host reads at a glance. */
function Fact({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1.5 text-sm font-medium text-slate-900">{value}</dd>
      {note && <p className="mt-1 text-sm leading-6 text-slate-600">{note}</p>}
    </div>
  );
}

function PeriodRow({
  period,
  locale,
  detail,
}: {
  period: AvailabilityPeriod;
  locale: string;
  detail?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-100 py-2.5 last:border-b-0">
      <span className="text-sm font-medium text-slate-900">
        {formatPeriod(period, locale)}
      </span>
      {detail && <span className="text-sm text-slate-600">{detail}</span>}
    </li>
  );
}

/** Who is holding a blocked range: a connected calendar, or the host themselves. */
function BlockDetail({ block, t }: { block: AvailabilityBlockPeriod; t: Translator }) {
  const nights = tPlural(
    t,
    "host.editor.availability.nights",
    block.nights,
    "{n} night",
    "{n} nights",
  ).text;

  if (block.source === "EXTERNAL") {
    const source =
      block.feedName ??
      (block.feedPlatform ? PLATFORM_LABEL[block.feedPlatform] : null) ??
      text(t, "host.editor.availability.external_generic", "a connected calendar");
    return (
      <>
        <span className="notranslate" translate="no">
          {source}
        </span>
        <span className="text-slate-400"> · </span>
        {nights}
      </>
    );
  }

  return (
    <>
      {block.reason && (
        <>
          <span>{block.reason}</span>
          <span className="text-slate-400"> · </span>
        </>
      )}
      {nights}
    </>
  );
}

function MoreRow({ shown, total, t }: { shown: number; total: number; t: Translator }) {
  if (total <= shown) return null;
  return (
    <li className="pt-2.5 text-sm text-slate-500">
      {
        ti(t, "host.editor.availability.more_in_calendar", "{n} more in Calendar", {
          n: total - shown,
        }).text
      }
    </li>
  );
}

function Panel({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h3 id={id} className="text-sm font-semibold text-slate-900">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function AvailabilitySummary({
  overview,
  defaultsEditor,
  bookingRulesEditor,
  t,
}: {
  overview: ListingAvailabilityOverview;
  /**
   * The editable default, mounted between the lead and the report.
   *
   * Passed in rather than imported so this stays a server component: the form under it
   * is interactive, everything around it is finished text, and only the form has to
   * ship to the browser.
   */
  defaultsEditor: React.ReactNode;
  /**
   * The listing-wide booking rules, mounted under the default.
   *
   * A second slot rather than a second page: "how a date starts out" and "what a guest
   * may do with an open date" are the two halves of one question, and a host setting a
   * four-week maximum is not going to look for it under Pricing.
   */
  bookingRulesEditor: React.ReactNode;
  t: Translator;
}) {
  const locale = t.locale;
  const closed = overview.mode === "CLOSED";
  const status = resolveListingStatus(t, overview.status);
  // Named so the Calendar opens ready for the job this page hands off: choosing dates
  // to open or block, rather than a menu asking what the host came for.
  const calendarHref = calendarHrefForListing(overview.listingId, "availability");
  const horizon = ti(
    t,
    "host.editor.availability.horizon",
    "Next {n} months",
    { n: overview.horizonMonths },
  ).text;

  return (
    <div className="mx-auto w-full max-w-2xl py-6 md:py-10">
      {/* Named by the rail, the browser tab and the active chip on a phone. Kept in the
          outline for screen readers, which have no rail to read. */}
      <header>
        <h2 className="sr-only">
          <T t={t} k="host.editor.section.availability" source="Availability" />
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          <T
            t={t}
            k="host.editor.availability.lead"
            source="Set how future dates start out here. Opening or blocking particular dates happens in the calendar."
          />
        </p>
      </header>

      {defaultsEditor}

      {bookingRulesEditor}

      <dl className="mt-8 grid gap-3 sm:grid-cols-2">
        <Fact
          icon={overview.visibility === "LIVE" ? CheckCircle2 : AlertTriangle}
          label={text(t, "host.editor.availability.visibility_label", "Listing visibility")}
          value={status.text}
          note={visibilityNote(t, overview.visibility)}
        />
        <Fact
          icon={Link2}
          label={text(t, "host.editor.availability.feeds_label", "Connected calendars")}
          value={
            tPlural(
              t,
              "host.editor.availability.feed_count",
              overview.calendars.length,
              "{n} calendar",
              "{n} calendars",
            ).text
          }
          note={
            overview.calendars.length === 0
              ? text(t, "host.editor.availability.feeds_none", "No external calendar is connected.")
              : overview.calendarsFailing > 0
                ? tPlural(
                    t,
                    "host.editor.availability.feeds_failing",
                    overview.calendarsFailing,
                    "{n} is not syncing. Fix it in Calendar.",
                    "{n} are not syncing. Fix them in Calendar.",
                  ).text
                : text(
                    t,
                    "host.editor.availability.feeds_healthy",
                    "No sync errors are currently reported.",
                  )
          }
        />
        <Fact
          icon={Clock}
          label={text(
            t,
            "host.editor.availability.scheduled_label",
            "Upcoming date ranges",
          )}
          value={
            tPlural(
              t,
              "host.editor.availability.scheduled_count",
              overview.scheduledCount,
              "{n} upcoming range",
              "{n} upcoming ranges",
            ).text
          }
          note={
            overview.scheduledCount === 0
              ? text(
                  t,
                  "host.editor.availability.scheduled_none",
                  "No future open or blocked ranges are recorded.",
                )
              : text(
                  t,
                  "host.editor.availability.scheduled_note",
                  "Open or blocked ranges that have not started yet.",
                )
          }
        />
      </dl>

      {closed && (
        <Panel
          id="availability-windows"
          title={text(t, "host.editor.availability.windows_title", "Open dates")}
        >
          {overview.openWindowCount === 0 ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              <T
                t={t}
                k="host.editor.availability.windows_empty"
                source="No dates are open, so guests cannot book this listing yet. Open dates in Calendar."
              />
            </p>
          ) : (
            <ul className="mt-2">
              {overview.openWindows.map((window) => (
                <PeriodRow
                  key={window.id}
                  period={window}
                  locale={locale}
                  detail={
                    tPlural(
                      t,
                      "host.editor.availability.nights",
                      window.nights,
                      "{n} night",
                      "{n} nights",
                    ).text
                  }
                />
              ))}
              <MoreRow
                shown={overview.openWindows.length}
                total={overview.openWindowCount}
                t={t}
              />
            </ul>
          )}
        </Panel>
      )}

      <Panel
        id="availability-blocked"
        title={text(t, "host.editor.availability.blocked_title", "Blocked dates")}
      >
        <p className="mt-1 text-xs text-slate-500">{horizon}</p>
        {overview.blockedPeriodCount === 0 ? (
          <p className="mt-2 text-sm leading-6 text-slate-600">
            <T
              t={t}
              k="host.editor.availability.blocked_empty"
              source="Nothing is blocked. Confirmed reservations are shown in Reservations, not here."
            />
          </p>
        ) : (
          <ul className="mt-2">
            {overview.blockedPeriods.map((block) => (
              <PeriodRow
                key={block.id}
                period={block}
                locale={locale}
                detail={<BlockDetail block={block} t={t} />}
              />
            ))}
            <MoreRow
              shown={overview.blockedPeriods.length}
              total={overview.blockedPeriodCount}
              t={t}
            />
          </ul>
        )}
      </Panel>

      {overview.calendars.length > 0 && (
        <Panel
          id="availability-feeds"
          title={text(t, "host.editor.availability.feeds_title", "External calendars")}
        >
          <ul className="mt-2">
            {overview.calendars.map((calendar) => (
              <li
                key={calendar.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-100 py-2.5 last:border-b-0"
              >
                <span
                  className="text-sm font-medium text-slate-900 notranslate"
                  translate="no"
                >
                  {calendar.name}
                  {calendar.platform && calendar.name !== PLATFORM_LABEL[calendar.platform] && (
                    <span className="ml-2 font-normal text-slate-500">
                      {PLATFORM_LABEL[calendar.platform]}
                    </span>
                  )}
                </span>
                <span className={`text-sm ${HEALTH_STYLE[calendar.health]}`}>
                  {healthLabel(t, calendar)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* The handoff, named after the job rather than after the screen. "Open
          calendar" told a host where to go and nothing about why; this says what they
          are about to do, and the link carries that intent so the calendar arrives
          asking for dates instead of showing a menu. */}
      <section
        aria-labelledby="availability-dates"
        className="mt-8 rounded-2xl bg-slate-50 p-5"
      >
        <h3 id="availability-dates" className="text-sm font-semibold text-slate-900">
          <T
            t={t}
            k="host.editor.availability.dates_title"
            source="Particular dates"
          />
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          <T
            t={t}
            k="host.editor.availability.dates_body"
            source="A holiday, a repair, a stay you took directly — anything that applies to some dates and not to others is set on the calendar."
          />
        </p>
        <Link
          href={calendarHref}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f1f5f9] px-5 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#e2e8f0] focus-visible:bg-[#e2e8f0] focus-visible:outline-none"
        >
          <T
            t={t}
            k="host.editor.availability.dates_cta"
            source="Open or block specific dates"
          />
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      <Panel
        id="availability-how"
        title={text(t, "host.editor.availability.how_title", "How availability works")}
      >
        <ul className="mt-2 space-y-3">
          <li className="flex gap-3 text-sm leading-6 text-slate-600">
            <CalendarDays className="mt-1 size-4 shrink-0 text-slate-400" aria-hidden />
            <T
              t={t}
              k="host.editor.availability.how_dates"
              source="Select dates in Calendar to open or block them."
            />
          </li>
          <li className="flex gap-3 text-sm leading-6 text-slate-600">
            <CalendarRange className="mt-1 size-4 shrink-0 text-slate-400" aria-hidden />
            <T
              t={t}
              k="host.editor.availability.how_listing_wide"
              source="The default above only affects dates you have not decided about. Booked dates are never changed by it."
            />
          </li>
          <li className="flex gap-3 text-sm leading-6 text-slate-600">
            <Link2 className="mt-1 size-4 shrink-0 text-slate-400" aria-hidden />
            <T
              t={t}
              k="host.editor.availability.how_external"
              source="External Airbnb, Booking.com and other calendars are connected and managed from Calendar."
            />
          </li>
        </ul>
      </Panel>
    </div>
  );
}
