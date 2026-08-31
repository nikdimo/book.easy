import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Clock,
  Link2,
  Lock,
  Unlock,
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
 * Availability, reported rather than edited.
 *
 * The Calendar is where a host opens and blocks dates, and duplicating any part of that
 * here would give the same decision two homes and two answers. So this pane answers the
 * question the editor is actually asked — *what is my availability right now?* — and
 * then hands over: every row is text, and the only control is the link to Calendar.
 *
 * It is deliberately not counted as an editor step. There is nothing to complete here,
 * and a checkmark for reading a summary would inflate the progress a host is trying to
 * read honestly.
 *
 * Rendered on the server, so dates are formatted with the server's full ICU data and
 * shipped as finished text — there is no client component underneath to re-resolve the
 * locale against whatever data the browser happens to ship, which is the hydration
 * mismatch the Calendar's format snapshots exist to avoid.
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
  t,
}: {
  overview: ListingAvailabilityOverview;
  t: Translator;
}) {
  const locale = t.locale;
  const closed = overview.mode === "CLOSED";
  const status = resolveListingStatus(t, overview.status);
  const calendarHref = calendarHrefForListing(overview.listingId);
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
            source="A summary of what is open and what is blocked. Availability itself is set in Calendar."
          />
        </p>
        <Link
          href={calendarHref}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f1f5f9] px-5 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#e2e8f0] focus-visible:bg-[#e2e8f0] focus-visible:outline-none"
        >
          <T
            t={t}
            k="host.editor.availability.manage_cta"
            source="Manage availability in Calendar"
          />
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </header>

      <dl className="mt-8 grid gap-3 sm:grid-cols-2">
        <Fact
          icon={overview.visibility === "LIVE" ? CheckCircle2 : AlertTriangle}
          label={text(t, "host.editor.availability.visibility_label", "Listing visibility")}
          value={status.text}
          note={visibilityNote(t, overview.visibility)}
        />
        <Fact
          icon={closed ? Lock : Unlock}
          label={text(t, "host.editor.availability.mode_label", "Availability mode")}
          value={
            closed
              ? text(t, "host.editor.availability.mode_closed", "Closed by default")
              : text(t, "host.editor.availability.mode_open", "Open by default")
          }
          note={
            closed
              ? text(t, "host.editor.availability.mode_closed_note", "Only the dates you open can be booked.")
              : text(t, "host.editor.availability.mode_open_note", "Every future date can be booked unless you block it.")
          }
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
              source="Listing-wide availability controls future dates. Dates already booked are never changed by it."
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
