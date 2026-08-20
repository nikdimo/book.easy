"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Check,
  CircleAlert,
  Copy,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import {
  PLATFORM_LABEL,
  platformFromFeedUrl,
} from "@/lib/host/v2/calendar-feed-platform";
import {
  addCalendarFeed,
  getCalendarConnections,
  refreshCalendarFeed,
  regenerateCalendarExportToken,
  removeCalendarFeed,
  type CalendarConnectionsView,
  type CalendarFeedView,
} from "@/lib/actions/calendar-sync.actions";
import { ChannelChip } from "./channel-chip";
import { Disclosure, Field } from "./workbench-ui";

/**
 * Connected calendars, inside the calendar.
 *
 * Two-way sync is one idea stated twice: the link this listing publishes, and the links
 * other channels publish back. The old surface asked for both at once, on another page,
 * behind an accordion, and made the host name each feed before it would take it. Here
 * the host pastes one URL and the panel works out the rest — the channel is read from
 * the URL's own domain, which is evidence rather than a guess, so an Airbnb link
 * arrives called Airbnb with Airbnb's mark beside it and nobody typed anything.
 *
 * The sync itself is not reimplemented: every button calls the same server action the
 * old page called, so feeds, their schedule and their failure states still have exactly
 * one implementation behind them.
 */
export function ConnectedCalendars({ listingId }: { listingId: string }) {
  const i18n = useI18n();
  const { locale, resolve } = i18n;
  const [data, setData] = useState<CalendarConnectionsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [busyFeedId, setBusyFeedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Loaded when the view opens rather than with the workspace: most hosts list in one
  // place and never come here, and this call mints the export token, so a listing that
  // never syncs still publishes no feed at all.
  useEffect(() => {
    let live = true;
    // Nothing resets `loading` on the way in: the caller keys this on the listing, so a
    // different property arrives as a fresh mount already in its loading state.
    void getCalendarConnections(listingId)
      .then((result) => {
        if (!live) return;
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        setData(result);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [listingId]);

  function apply(
    result:
      | { error: string }
      | { success: string; connections: CalendarConnectionsView },
  ) {
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setData(result.connections);
    toast.success(result.success);
  }

  /** What the URL in the box says it is, live, while the host is still pasting. */
  const detected = platformFromFeedUrl(url.trim());

  function connect() {
    const value = url.trim();
    if (!value) {
      toast.error(
        resolve(
          "host.v2.calendar.connections.url_required",
          "Paste the calendar link first.",
        ).text,
      );
      return;
    }
    startTransition(async () => {
      // No name is sent: the server names it after the channel that served the link,
      // and "Connected calendar" where it cannot tell.
      const result = await addCalendarFeed(listingId, { name: "", url: value });
      if (!("error" in result)) setUrl("");
      apply(result);
    });
  }

  function refresh(feedId: string) {
    setBusyFeedId(feedId);
    startTransition(async () => {
      apply(await refreshCalendarFeed(listingId, feedId));
      setBusyFeedId(null);
    });
  }

  function disconnect(feedId: string) {
    setBusyFeedId(feedId);
    startTransition(async () => {
      apply(await removeCalendarFeed(listingId, feedId));
      setBusyFeedId(null);
    });
  }

  function rotate() {
    startTransition(async () => {
      const result = await regenerateCalendarExportToken(listingId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setData((previous) =>
        previous ? { ...previous, exportUrl: result.exportUrl } : previous,
      );
      toast.success(result.success);
    });
  }

  function copyExportUrl() {
    if (!data) return;
    void navigator.clipboard
      .writeText(data.exportUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success(
          resolve("host.v2.calendar.connections.copied", "Calendar link copied.").text,
        );
      })
      .catch(() =>
        toast.error(
          resolve(
            "host.v2.calendar.connections.copy_failed",
            "Could not copy — select the link and copy it manually.",
          ).text,
        ),
      );
  }

  function syncedLabel(value: string | null) {
    if (!value) {
      return resolve(
        "host.v2.calendar.connections.never_synced",
        "not checked yet",
      ).text;
    }
    return new Date(value).toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  if (loading || !data) {
    return (
      <p className="flex items-center gap-2 px-2 py-6 text-[0.8125rem] text-slate-500">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {
          resolve(
            "host.v2.calendar.connections.loading",
            "Loading your calendar links…",
          ).text
        }
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-2">
      {/* 1. Bring a calendar in. First because it is what the host came here to do —
          the link to hand out is only useful once something is listening for it. */}
      <div className="flex flex-col gap-2.5">
        <Field
          label={
            resolve(
              "host.v2.calendar.connections.import_title",
              "Add a calendar from another site",
            ).text
          }
          htmlFor="v2-feed-url"
          hint={
            resolve(
              "host.v2.calendar.connections.import_hint",
              "Copy the calendar link Airbnb, Booking.com or Vrbo gives you and paste it here. Their reservations will block those nights on this listing.",
            ).text
          }
        >
          <div className="relative">
            <Link2
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              id="v2-feed-url"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={url}
              disabled={pending}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  connect();
                }
              }}
              placeholder={
                resolve(
                  "host.v2.calendar.connections.url_placeholder",
                  "https://…/calendar.ics",
                ).text
              }
              className="min-h-11 pl-9 font-mono text-[0.8125rem]"
            />
          </div>
        </Field>

        {/* The detection, said out loud before the host commits. It is the difference
            between "we understood your link" and a name they would have had to type. */}
        {url.trim() ? (
          <p className="flex items-center gap-1.5 text-[0.75rem] leading-4 text-slate-500">
            {detected ? (
              <>
                <ChannelChip platform={detected} />
                {
                  interpolate(
                    resolve(
                      "host.v2.calendar.connections.detected",
                      "Recognised as {channel} — it will be connected under that name.",
                    ),
                    { channel: PLATFORM_LABEL[detected] },
                  ).text
                }
              </>
            ) : (
              resolve(
                "host.v2.calendar.connections.detected_unknown",
                "We do not recognise this site, which is fine — the link will still be checked and synced.",
              ).text
            )}
          </p>
        ) : null}

        <Button
          type="button"
          disabled={pending}
          onClick={connect}
          className="min-h-11 w-full bg-[#d9774f] text-white hover:bg-[#c2643e] disabled:bg-slate-100 disabled:text-slate-400"
        >
          {pending && !busyFeedId ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {resolve("host.v2.calendar.connections.connect", "Connect calendar").text}
        </Button>
      </div>

      {/* 2. What is already connected, and whether it is actually working. */}
      {data.feeds.length > 0 ? (
        <div className="flex flex-col">
          <h3 className="pb-1 text-[0.75rem] font-semibold uppercase tracking-wide text-slate-400">
            {
              interpolate(
                i18n.plural(
                  "host.v2.calendar.connections.connected_count",
                  data.feeds.length,
                  "{n} calendar connected",
                  "{n} calendars connected",
                ),
                {},
              ).text
            }
          </h3>
          <ul className="divide-y divide-slate-100">
            {data.feeds.map((feed) => (
              <FeedRow
                key={feed.id}
                feed={feed}
                busy={pending && busyFeedId === feed.id}
                disabled={pending}
                syncedLabel={syncedLabel(feed.lastSyncedAt)}
                onRefresh={() => refresh(feed.id)}
                onDisconnect={() => disconnect(feed.id)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {/* 3. The link going the other way. Quieter, because it is pasted once and then
          never thought about again. */}
      <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-4">
        <Field
          label={
            resolve(
              "host.v2.calendar.connections.export_title",
              "This listing's own calendar link",
            ).text
          }
          htmlFor="v2-feed-export"
          hint={
            resolve(
              "host.v2.calendar.connections.export_hint",
              "Paste it wherever another site asks to import a calendar. It publishes only which nights are taken — never guest names or prices.",
            ).text
          }
        >
          <div className="flex gap-2">
            <Input
              id="v2-feed-export"
              readOnly
              value={data.exportUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 font-mono text-[0.75rem]"
            />
            <Button
              type="button"
              variant="outline"
              onClick={copyExportUrl}
              className="min-h-11 shrink-0"
            >
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied
                ? resolve("host.v2.calendar.connections.copied_short", "Copied").text
                : resolve("host.v2.calendar.connections.copy", "Copy").text}
            </Button>
          </div>
        </Field>

        <Disclosure
          label={
            resolve(
              "host.v2.calendar.connections.rotate_disclosure",
              "Shared this link by mistake?",
            ).text
          }
        >
          <p>
            {
              resolve(
                "host.v2.calendar.connections.rotate_hint",
                "Anyone holding this link can see which of your nights are taken. Creating a new one stops the old link working immediately — you will then have to paste the new link into every site you had connected.",
              ).text
            }
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={rotate}
            className="mt-2"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {resolve("host.v2.calendar.connections.rotate", "Create a new link").text}
          </Button>
        </Disclosure>
      </div>

      <p className="text-[0.75rem] leading-4 text-slate-400">
        {
          resolve(
            "host.v2.calendar.connections.frequency_note",
            "Connected calendars are checked automatically about once an hour, and other sites read yours on their own schedule — so a change can take an hour or two to show on both sides. For a same-day change, block the nights on each site directly.",
          ).text
        }
      </p>
    </div>
  );
}

/**
 * One connected calendar: who it is, whether it is working, and the two things a host
 * ever does to it.
 *
 * The URL is not printed. It is the private token that reads the host's real calendar,
 * it is thirty unreadable characters wide, and the channel's name plus what it blocked
 * says more about the row than the string ever did.
 */
function FeedRow({
  feed,
  busy,
  disabled,
  syncedLabel,
  onRefresh,
  onDisconnect,
}: {
  feed: CalendarFeedView;
  busy: boolean;
  disabled: boolean;
  syncedLabel: string;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  const i18n = useI18n();
  const failing = feed.lastStatus === "ERROR";
  return (
    <li className="flex items-start gap-2.5 py-3">
      <span className="mt-0.5 shrink-0">
        {feed.platform ? (
          <ChannelChip platform={feed.platform} className="size-5 text-[0.6875rem]" />
        ) : (
          <span
            aria-hidden
            className="grid size-5 place-items-center rounded bg-slate-100 text-slate-400"
          >
            <Link2 className="size-3" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.875rem] font-medium text-slate-900">
          {feed.name}
        </p>
        <p
          className={cn(
            "mt-0.5 text-[0.75rem] leading-4",
            failing ? "text-amber-700" : "text-slate-500",
          )}
        >
          {failing ? (
            <span className="inline-flex items-start gap-1">
              <CircleAlert className="mt-px size-3 shrink-0" aria-hidden />
              {feed.lastError ??
                i18n.resolve(
                  "host.v2.calendar.connections.status_error",
                  "This calendar could not be read. Check the link is still valid on the other site.",
                ).text}
            </span>
          ) : (
            interpolate(
              i18n.plural(
                "host.v2.calendar.connections.status_ok",
                feed.lastBlockedNights,
                "{n} night blocked · checked {when}",
                "{n} nights blocked · checked {when}",
              ),
              { when: syncedLabel },
            ).text
          )}
        </p>
        <div className="mt-1 flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onRefresh}
            className="-ml-2 h-8 text-slate-600"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            {i18n.resolve("host.v2.calendar.connections.refresh", "Check now").text}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onDisconnect}
            className="h-8 text-slate-600"
          >
            <Trash2 className="size-3.5" aria-hidden />
            {i18n.resolve("host.v2.calendar.connections.remove", "Disconnect").text}
          </Button>
        </div>
      </div>
    </li>
  );
}
