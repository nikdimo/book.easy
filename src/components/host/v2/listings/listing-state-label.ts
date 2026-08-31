"use client";

import { interpolate, useI18n } from "@/lib/i18n/client";
import type { ListingState, ListingStateTone } from "@/lib/host/listing-state";

/**
 * Turns a resolved listing state into the sentence shown under the title, plus the
 * short form the grid badge uses. Sentence and badge are separate strings rather than
 * one truncated at render: "Calendar sync failed 3 days ago" clipped to a photo corner
 * would read as "Calendar sync fai…", which tells the host nothing.
 */

const TONE_CLASS: Record<ListingStateTone, string> = {
  error: "text-rose-700",
  warning: "text-amber-700",
  waiting: "text-slate-500",
  neutral: "text-slate-500",
};

function daysAgo(date: Date) {
  const then = new Date(date);
  then.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86_400_000));
}

export function useListingStateLabel() {
  // `plural` is deliberately called as `i18n.plural(...)` rather than destructured:
  // scripts/extract-ui-strings.ts only picks plural keys up as a property access, so a
  // bare `plural(...)` would ship these two strings untranslatable in every language.
  const i18n = useI18n();
  const { locale, resolve } = i18n;

  const formatDay = (value: Date) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(value);

  return function label(state: ListingState): {
    text: string;
    short: string;
    className: string;
    translated: boolean;
  } {
    const className = TONE_CLASS[state.tone];
    const v = state.values;

    switch (state.code) {
      case "SYNC_FAILED": {
        const short = resolve("host.v2.listings.state.sync_failed_short", "Sync failed");
        // No `lastSyncedAt` means the feed has never completed once — "failed 0 days
        // ago" would be a lie about a connection that never worked in the first place.
        const full =
          v.date instanceof Date
            ? interpolate(
                resolve(
                  "host.v2.listings.state.sync_failed",
                  "{feed} calendar sync failed — last worked {days} days ago",
                ),
                { feed: String(v.feed), days: daysAgo(v.date) },
              )
            : interpolate(
                resolve(
                  "host.v2.listings.state.sync_never",
                  "{feed} calendar has never synced",
                ),
                { feed: String(v.feed) },
              );
        return { text: full.text, short: short.text, className, translated: full.translated };
      }
      case "SUSPENDED": {
        const r = resolve(
          "host.v2.listings.state.suspended",
          "Suspended by our team — check your email for details",
        );
        const s = resolve("host.v2.listings.state.suspended_short", "Suspended");
        return { text: r.text, short: s.text, className, translated: r.translated };
      }
      case "NO_PRICE": {
        const r = resolve(
          "host.v2.listings.state.no_price",
          "No price set — guests can't book",
        );
        const s = resolve("host.v2.listings.state.no_price_short", "No price");
        return { text: r.text, short: s.text, className, translated: r.translated };
      }
      case "OUT_OF_DATES": {
        const r = resolve(
          "host.v2.listings.state.out_of_dates",
          "No bookable dates left — add availability",
        );
        const s = resolve("host.v2.listings.state.out_of_dates_short", "No dates");
        return { text: r.text, short: s.text, className, translated: r.translated };
      }
      case "FEW_PHOTOS": {
        const r = interpolate(
          resolve(
            "host.v2.listings.state.few_photos",
            "Only {count} photos — listings with {target} get more bookings",
          ),
          { count: Number(v.count), target: Number(v.target) },
        );
        const s = resolve("host.v2.listings.state.few_photos_short", "Few photos");
        return { text: r.text, short: s.text, className, translated: r.translated };
      }
      case "NEEDS_REVIEW": {
        const r = resolve(
          "host.v2.listings.state.needs_review",
          "Your edits are waiting for review",
        );
        const s = resolve("host.v2.listings.state.needs_review_short", "In review");
        return { text: r.text, short: s.text, className, translated: r.translated };
      }
      case "HIDDEN": {
        const r = resolve(
          "host.v2.listings.state.hidden",
          "Hidden from guests — unhide it when you're ready",
        );
        const s = resolve("host.v2.listings.state.hidden_short", "Hidden");
        return { text: r.text, short: s.text, className, translated: r.translated };
      }
      case "ARCHIVED": {
        const r = resolve(
          "host.v2.listings.state.archived",
          "Archived — bookings and history are kept",
        );
        const s = resolve("host.v2.listings.state.archived_short", "Archived");
        return { text: r.text, short: s.text, className, translated: r.translated };
      }
      case "NEXT_CHECK_IN": {
        const nights = Number(v.nights);
        const arrival = interpolate(
          resolve("host.v2.listings.state.next_check_in", "Next guest arrives {date}"),
          { date: formatDay(v.date as Date) },
        );
        // The nights figure is a useful second beat, but only once there is more than
        // the arriving stay to report — otherwise it restates the same booking twice.
        const tail =
          nights > 0
            ? i18n.plural(
                "host.v2.listings.state.nights_booked",
                nights,
                "{n} night booked this month",
                "{n} nights booked this month",
              )
            : null;
        return {
          text: tail ? `${arrival.text} · ${tail.text}` : arrival.text,
          short: arrival.text,
          className,
          translated: arrival.translated || Boolean(tail?.translated),
        };
      }
      case "NIGHTS_BOOKED": {
        const r = i18n.plural(
          "host.v2.listings.state.nights_booked",
          Number(v.nights),
          "{n} night booked this month",
          "{n} nights booked this month",
        );
        return { text: r.text, short: r.text, className, translated: r.translated };
      }
      case "NO_BOOKINGS": {
        const r = resolve(
          "host.v2.listings.state.no_bookings",
          "No bookings in the next 30 days",
        );
        return { text: r.text, short: r.text, className, translated: r.translated };
      }
    }
  };
}
