"use client";

import { useState, useTransition } from "react";
import {
  CalendarSync,
  Check,
  ChevronDown,
  Copy,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { interpolate, Tx, useI18n } from "@/lib/i18n/client";
import {
  addCalendarFeed,
  getCalendarConnections,
  refreshCalendarFeed,
  regenerateCalendarExportToken,
  removeCalendarFeed,
  type CalendarConnectionsView,
} from "@/lib/actions/calendar-sync.actions";

/**
 * Two-way calendar sync, as the host sees it: the link to hand other platforms, and the
 * links they hand back.
 *
 * Collapsed until asked for. Most hosts list in one place and never open this, and the
 * export token is only minted when the panel is first expanded — so a listing that
 * never syncs publishes no feed at all.
 */
export function CalendarConnections({
  listingId,
  feedCount = 0,
}: {
  listingId: string;
  /** Known from the server render, so the collapsed row can say how many calendars are
   *  connected without loading the panel. */
  feedCount?: number;
}) {
  const { locale, resolve } = useI18n();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CalendarConnectionsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();

  const connectedCount = data ? data.feeds.length : feedCount;

  function expand() {
    setOpen((previous) => !previous);
    if (data || loading) return;
    setLoading(true);
    void getCalendarConnections(listingId)
      .then((result) => {
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        setData(result);
      })
      .finally(() => setLoading(false));
  }

  function apply(
    result: { error: string } | { success: string; connections: CalendarConnectionsView },
  ) {
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setData(result.connections);
    toast.success(result.success);
  }

  function copyExportUrl() {
    if (!data) return;
    void navigator.clipboard
      .writeText(data.exportUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success(resolve("host.sync.copied", "Calendar link copied.").text);
      })
      .catch(() =>
        toast.error(
          resolve("host.sync.copy_failed", "Could not copy — select the link and copy it manually.")
            .text,
        ),
      );
  }

  function connect() {
    if (!url.trim()) {
      toast.error(resolve("host.sync.url_required", "Paste the calendar link first.").text);
      return;
    }
    startTransition(async () => {
      const result = await addCalendarFeed(listingId, { name: name.trim(), url: url.trim() });
      if (!("error" in result)) {
        setName("");
        setUrl("");
      }
      apply(result);
    });
  }

  function refresh(feedId: string) {
    startTransition(async () => apply(await refreshCalendarFeed(listingId, feedId)));
  }

  function remove(feedId: string) {
    startTransition(async () => apply(await removeCalendarFeed(listingId, feedId)));
  }

  function rotate() {
    startTransition(async () => {
      const result = await regenerateCalendarExportToken(listingId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setData((previous) => (previous ? { ...previous, exportUrl: result.exportUrl } : previous));
      toast.success(result.success);
    });
  }

  function syncedLabel(value: string | null) {
    if (!value) return resolve("host.sync.never_synced", "Not checked yet").text;
    return new Date(value).toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <button
        type="button"
        onClick={expand}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          <CalendarSync className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            <Tx k="host.sync.title" source="Sync with Airbnb, Booking.com and others" />
          </span>
          <span className="block text-sm md:text-xs text-muted-foreground">
            {connectedCount > 0
              ? interpolate(
                  resolve(
                    "host.sync.summary_connected",
                    "{count} calendar(s) connected — booked dates stay in step automatically.",
                  ),
                  { count: connectedCount },
                ).text
              : resolve(
                  "host.sync.summary_empty",
                  "Block dates here when a guest books elsewhere, and the other way round.",
                ).text}
          </span>
        </span>
        <ChevronDown
          className={`size-4.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="border-t px-5 py-4">
          {loading || !data ? (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <Tx k="host.sync.loading" source="Loading your calendar links…" />
            </p>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold">
                  <Tx k="host.sync.export_title" source="1. Give this link to the other site" />
                </h3>
                <p className="mt-0.5 text-sm md:text-xs text-muted-foreground">
                  <Tx
                    k="host.sync.export_hint"
                    source="Paste it wherever the other platform asks to import a calendar. It publishes only which nights are taken — never guest names or prices."
                  />
                </p>
                <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                  <Input
                    readOnly
                    value={data.exportUrl}
                    aria-label={resolve("host.sync.export_label", "Your calendar link").text}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 font-mono text-xs"
                  />
                  <Button type="button" variant="outline" onClick={copyExportUrl} className="sm:min-w-28">
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? (
                      <Tx k="host.sync.copied_short" source="Copied" />
                    ) : (
                      <Tx k="host.sync.copy" source="Copy" />
                    )}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={rotate}
                  className="mt-1.5 -ml-2 text-muted-foreground"
                >
                  <RotateCcw className="size-3.5" />
                  <Tx k="host.sync.rotate" source="Create a new link" />
                </Button>
                <p className="text-xs text-muted-foreground">
                  <Tx
                    k="host.sync.rotate_hint"
                    source="Anyone holding this link can see your booked dates. Create a new one if it has been shared by mistake — then paste the new link into every platform again."
                  />
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  <Tx k="host.sync.import_title" source="2. Add a calendar from another site" />
                </h3>
                <p className="mt-0.5 text-sm md:text-xs text-muted-foreground">
                  <Tx
                    k="host.sync.import_hint"
                    source="Copy the calendar link the other platform gives you and paste it here. Its reservations will block those dates on this listing."
                  />
                </p>
                <div className="mt-2.5 grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]">
                  <div>
                    <Label htmlFor="calendar-feed-name" className="sr-only">
                      <Tx k="host.sync.name_label" source="Calendar name" />
                    </Label>
                    <Input
                      id="calendar-feed-name"
                      value={name}
                      disabled={pending}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={resolve("host.sync.name_placeholder", "Airbnb").text}
                    />
                  </div>
                  <div className="relative min-w-0">
                    <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Label htmlFor="calendar-feed-url" className="sr-only">
                      <Tx k="host.sync.url_label" source="Calendar link" />
                    </Label>
                    <Input
                      id="calendar-feed-url"
                      type="url"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
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
                        resolve("host.sync.url_placeholder", "https://…/calendar.ics").text
                      }
                      className="pl-11"
                    />
                  </div>
                  <Button type="button" disabled={pending} onClick={connect} className="sm:min-w-28">
                    {pending ? <Loader2 className="animate-spin" /> : <CalendarSync />}
                    <Tx k="host.sync.connect" source="Connect" />
                  </Button>
                </div>
              </div>

              {data.feeds.length > 0 ? (
                <ul className="divide-y rounded-xl border">
                  {data.feeds.map((feed) => (
                    <li key={feed.id} className="grid gap-2 p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {feed.name}
                          {feed.lastStatus === "ERROR" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                              <TriangleAlert className="size-3" />
                              <Tx k="host.sync.status_error" source="Not updating" />
                            </span>
                          ) : feed.lastStatus === "OK" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              <Check className="size-3" />
                              <Tx k="host.sync.status_ok" source="Syncing" />
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{feed.url}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {feed.lastStatus === "ERROR" && feed.lastError
                            ? feed.lastError
                            : interpolate(
                                resolve(
                                  "host.sync.feed_stats",
                                  "{nights} night(s) blocked · last checked {when}",
                                ),
                                {
                                  nights: feed.lastBlockedNights,
                                  when: syncedLabel(feed.lastSyncedAt),
                                },
                              ).text}
                        </p>
                      </div>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => refresh(feed.id)}
                        >
                          <RefreshCw className="size-3.5" />
                          <Tx k="host.sync.refresh" source="Update now" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => remove(feed.id)}
                        >
                          <Trash2 className="size-3.5" />
                          <Tx k="host.sync.remove" source="Disconnect" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              <p className="text-xs text-muted-foreground">
                <Tx
                  k="host.sync.frequency_note"
                  source="Connected calendars are checked automatically about once an hour. Platforms poll your link on their own schedule, so a change can take an hour or two to appear on both sides — for a same-day change, block the dates on each site directly."
                />
              </p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
