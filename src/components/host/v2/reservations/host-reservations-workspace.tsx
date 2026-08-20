"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { House, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import {
  ALL_ENTITIES,
  EntityChooserSheet,
  EntityRail,
  useRailPreference,
  type RailItem,
} from "@/components/host/v2/entity-rail";
import { formatCountdown } from "@/lib/host/booking-action-queue";
import { formatShortDate } from "@/lib/host/v2/calendar-format";
import {
  buildActionQueue,
  countsByFilter,
  groupReservations,
  selectReservations,
  summarizeProperty,
  type ReservationFilter,
  type ReservationSort,
} from "@/lib/host/v2/reservation-model";
import { RESERVATION_ANCHOR, anchorProps } from "@/lib/host/v2/reservation-anchors";
import type { HostReservationsData } from "@/lib/host/v2/reservation-types";
import { ReservationPanel } from "./reservation-panel";
import { ReservationStream, type ActionCardModel } from "./reservation-stream";
import { money, rowStatusLabel, rowStatusOf } from "./reservation-labels";

const RAIL_PREFERENCE_KEY = "bookeasy.host.v2.reservations.rail";

/**
 * The reservations panel: properties, the stream, and one reservation in full.
 *
 * Deliberately the calendar's frame — same rail, same widths, same hairlines, same
 * drawer behaviour on a phone. A host who has learned to switch property on the
 * calendar has already learned this screen, and the only thing that changed between
 * them is what sits in the middle.
 *
 * Unlike the calendar it opens on *all* properties, because the question this screen
 * answers ("what is happening this week") spans the portfolio, while editing a calendar
 * is always about one property at a time.
 */
export function HostReservationsWorkspace({
  data,
}: {
  data: HostReservationsData;
}) {
  const i18n = useI18n();
  const [propertyId, setPropertyId] = useState<string>(ALL_ENTITIES);
  const [filter, setFilter] = useState<ReservationFilter>("all");
  // Opens on the queue's own ranking: a request on a clock, then a guest waiting on a
  // reply, then an arrival to prepare for. Anything with nothing to do about it sorts
  // behind all of it, soonest first.
  const [sort, setSort] = useState<ReservationSort>("priority");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [railCompact, setRailCompact] = useRailPreference(RAIL_PREFERENCE_KEY);
  const panelRef = useRef<HTMLElement>(null);

  const properties = useMemo(
    () => new Map(data.properties.map((property) => [property.id, property])),
    [data.properties],
  );
  const propertyTitles = useMemo(
    () =>
      new Map(data.properties.map((property) => [property.id, property.title])),
    [data.properties],
  );

  /**
   * The queue, ranked once from the server's clock.
   *
   * `data.now` rather than `Date.now()`: the countdown labels are rendered on the
   * server too, and a client that disagreed about the current time by even a second
   * would produce different markup and fail hydration.
   */
  const queue = useMemo(
    () => buildActionQueue(data.reservations, new Date(data.now)),
    [data.reservations, data.now],
  );
  const actionById = useMemo(
    () => new Map(queue.map((item) => [item.bookingId, item])),
    [queue],
  );
  const actionIds = useMemo(
    () => new Set(queue.map((item) => item.bookingId)),
    [queue],
  );
  /** Queue position, which is what the default sort orders by. */
  const actionRank = useMemo(
    () => new Map(queue.map((item, index) => [item.bookingId, index])),
    [queue],
  );

  /** Status words the host is actually reading, so a search for them can match. */
  const statusLabels = useMemo(
    () =>
      new Map(
        data.reservations.map((reservation) => [
          reservation.id,
          rowStatusLabel(
            i18n,
            rowStatusOf(reservation, data.today),
            reservation,
          ).text,
        ]),
      ),
    [data.reservations, data.today, i18n],
  );

  const baseQuery = {
    propertyId: propertyId === ALL_ENTITIES ? null : propertyId,
    sort,
    query,
    today: data.today,
    actionIds,
    actionRank,
    propertyTitles,
    statusLabels,
  };

  /** Everything the property scope and the search allow, before the status chips. */
  const scoped = useMemo(
    () => selectReservations(data.reservations, { ...baseQuery, filter: "all" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.reservations, propertyId, sort, query, data.today, actionIds, actionRank, propertyTitles, statusLabels],
  );
  const counts = useMemo(
    () => countsByFilter(scoped, data.today, actionIds),
    [scoped, data.today, actionIds],
  );
  const visible = useMemo(
    () => selectReservations(scoped, { ...baseQuery, filter }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, filter, sort, data.today, actionIds, actionRank, propertyTitles, statusLabels, propertyId, query],
  );

  /**
   * The queue leads the stream, but only while the host is looking at everything or at
   * the queue itself. Asking for "Completed" is an explicit request for a slice, and
   * answering it with two expiring requests on top would ignore what was asked — the
   * chip keeps its red count, so the work is never actually out of sight.
   */
  const showQueue = filter === "all" || filter === "action";
  const actionCards: ActionCardModel[] = useMemo(() => {
    if (!showQueue) return [];
    const allowed = new Set(scoped.map((reservation) => reservation.id));
    const byId = new Map(
      data.reservations.map((reservation) => [reservation.id, reservation]),
    );
    return queue
      .filter((item) => allowed.has(item.bookingId))
      .map((item) => ({
        reservation: byId.get(item.bookingId)!,
        item,
        initialCountdown: item.dueAt
          ? formatCountdown(item.dueAt.getTime() - new Date(data.now).getTime())
          : null,
      }));
  }, [showQueue, scoped, queue, data.reservations, data.now]);

  // A reservation shown as an action card is not repeated as a row below it. The queue
  // is not a preview of the list — it is the part of the list that has a deadline.
  const sections = useMemo(
    () =>
      groupReservations(
        showQueue
          ? visible.filter((reservation) => !actionIds.has(reservation.id))
          : visible,
        data.today,
      ),
    [visible, showQueue, actionIds, data.today],
  );

  const active =
    data.reservations.find((reservation) => reservation.id === selectedId) ??
    actionCards[0]?.reservation ??
    visible[0] ??
    null;

  // The panel is one mounted tree. CSS puts it in the right column at desktop widths
  // and turns it into a full-height drawer below `lg`, so a dialog opened inside it
  // cannot lose its state to a second copy of itself.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDrawerOnDesktop = () => {
      if (desktop.matches) setSheetOpen(false);
    };
    closeDrawerOnDesktop();
    desktop.addEventListener("change", closeDrawerOnDesktop);
    return () => desktop.removeEventListener("change", closeDrawerOnDesktop);
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const drawer = panelRef.current;
    if (!drawer) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "a[href]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const frame = window.requestAnimationFrame(() => {
      drawer.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      // A confirmation dialog is portalled above this drawer and owns focus while it
      // is open. Let that topmost modal handle its own Escape and Tab.
      if (!drawer.contains(document.activeElement)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setSheetOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter(
        (element) =>
          element.offsetParent !== null && element.closest("[inert]") === null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [sheetOpen]);

  const railItems: RailItem[] = useMemo(
    () =>
      data.properties.map((property) => {
        const summary = summarizeProperty(
          data.reservations.filter(
            (reservation) => reservation.listingId === property.id,
          ),
          data.today,
          actionIds,
        );
        const attention =
          summary.action > 0
            ? {
                label: i18n.resolve(
                  "host.v2.reservations.rail.needs_you",
                  "Needs you",
                ),
                detail: interpolate(
                  i18n.plural(
                    "host.v2.reservations.rail.needs_you_count",
                    summary.action,
                    "{n} reservation is waiting",
                    "{n} reservations are waiting",
                  ),
                  {},
                ),
              }
            : null;
        const status =
          summary.upcoming > 0 && summary.nextCheckIn
            ? interpolate(
                i18n.plural(
                  "host.v2.reservations.rail.upcoming",
                  summary.upcoming,
                  "{n} upcoming · next {date}",
                  "{n} upcoming · next {date}",
                ),
                { date: formatShortDate(summary.nextCheckIn, data.formats) },
              )
            : summary.total > 0
              ? i18n.resolve(
                  "host.v2.reservations.rail.nothing_upcoming",
                  "Nothing upcoming",
                )
              : i18n.resolve(
                  "host.v2.reservations.rail.no_reservations",
                  "No reservations yet",
                );
        return {
          id: property.id,
          title: property.title,
          photoUrl: property.photoUrl,
          photoAlt: property.photoAlt,
          tone:
            summary.action > 0
              ? "warning"
              : summary.upcoming > 0
                ? "positive"
                : "neutral",
          attention,
          status,
          trailing:
            summary.action > 0 ? (
              <span
                className="shrink-0 rounded-full bg-[#ffe9dc] px-1.5 text-[0.6875rem] font-bold tabular-nums text-[#a94b28]"
                translate="no"
              >
                {summary.action}
              </span>
            ) : undefined,
        };
      }),
    [data.properties, data.reservations, data.today, data.formats, actionIds, i18n],
  );

  const portfolio = useMemo(() => {
    const upcomingValue = data.reservations
      .filter(
        (reservation) =>
          reservation.status === "CONFIRMED" &&
          reservation.checkIn > data.today,
      )
      .reduce((sum, reservation) => sum + reservation.total, 0);
    const currency = data.reservations[0]?.currency ?? "EUR";
    return interpolate(
      i18n.resolve(
        "host.v2.reservations.rail.all_detail",
        "{count} reservations · {value} upcoming",
      ),
      {
        count: data.reservations.length,
        value: money(upcomingValue, currency, data.formats),
      },
    );
  }, [data.reservations, data.today, data.formats, i18n]);

  const allCard = {
    label: i18n.resolve(
      "host.v2.reservations.rail.all",
      "All properties",
    ),
    detail: portfolio,
  };

  if (data.properties.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <House className="mx-auto size-6 text-slate-400" aria-hidden />
        <p className="mt-2 text-sm font-medium text-slate-700">
          {
            i18n.resolve(
              "host.v2.reservations.no_properties",
              "You have no properties that can take reservations yet.",
            ).text
          }
        </p>
      </section>
    );
  }

  const selectedProperty =
    propertyId === ALL_ENTITIES ? null : properties.get(propertyId);

  function selectReservation(id: string) {
    setSelectedId(id);
    // Below `lg` the panel is a drawer, and a tap on a row is the only thing that
    // opens it. Above `lg` the panel is already on screen and this is inert.
    if (window.matchMedia("(max-width: 1023px)").matches) setSheetOpen(true);
  }

  return (
    <div
      {...anchorProps(RESERVATION_ANCHOR.workspace)}
      className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:gap-2.5"
    >
      {/* Below `md` the rail is hidden, so which properties are being shown has to
          live somewhere. This is that somewhere. */}
      <button
        type="button"
        onClick={() => setChooserOpen(true)}
        className="flex shrink-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 text-left md:hidden"
      >
        {selectedProperty?.photoUrl ? (
          <Image
            src={selectedProperty.photoUrl}
            alt={selectedProperty.photoAlt || selectedProperty.title}
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"
          >
            <House className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] font-semibold text-slate-900">
            {selectedProperty?.title ?? allCard.label.text}
          </span>
          <span className="mt-0.5 block truncate text-[0.6875rem] text-slate-500">
            {selectedProperty
              ? (railItems.find((item) => item.id === selectedProperty.id)
                  ?.status?.text ?? "")
              : portfolio.text}
          </span>
        </span>
        <SlidersHorizontal className="size-4 shrink-0 text-slate-400" aria-hidden />
      </button>

      <div className="flex min-w-0 items-start gap-4 md:min-h-0 md:flex-1 md:items-stretch xl:gap-5">
        <EntityRail
          heading={
            i18n.resolve("host.v2.calendar.rail_heading", "Properties").text
          }
          ariaLabel={
            i18n.resolve("host.v2.calendar.rail_label", "Your properties").text
          }
          items={railItems}
          allCard={allCard}
          selectedId={propertyId}
          compact={railCompact}
          onSelect={setPropertyId}
          onToggleCompact={() => setRailCompact(!railCompact)}
          anchor={RESERVATION_ANCHOR.propertyRail}
          selectedAnchor={RESERVATION_ANCHOR.selectedProperty}
        />

        <ReservationStream
          data={data}
          properties={properties}
          sections={sections}
          actionCards={actionCards}
          counts={counts}
          filter={filter}
          sort={sort}
          query={query}
          activeId={active?.id ?? null}
          onFilterChange={setFilter}
          onSortChange={setSort}
          onQueryChange={setQuery}
          onSelect={selectReservation}
        />

        <aside
          ref={panelRef}
          role={sheetOpen ? "dialog" : undefined}
          aria-modal={sheetOpen ? true : undefined}
          aria-labelledby={sheetOpen ? "host-v2-reservation-drawer-title" : undefined}
          aria-label={
            sheetOpen
              ? undefined
              : i18n.resolve("host.v2.reservations.panel_label", "Reservation details")
                  .text
          }
          className={cn(
            "hidden",
            sheetOpen && "fixed inset-0 z-[45] flex h-dvh w-full flex-col bg-white",
            "lg:static lg:inset-auto lg:z-auto lg:flex lg:h-auto lg:min-h-0 lg:w-[23rem] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-slate-100 lg:bg-transparent lg:pl-4 xl:w-[25rem]",
          )}
        >
          <header
            className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 pb-3 lg:hidden"
            style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
          >
            <h2
              id="host-v2-reservation-drawer-title"
              className="min-w-0 flex-1 truncate text-base font-semibold text-slate-950"
            >
              {i18n.resolve("host.v2.reservations.drawer_title", "Reservation").text}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setSheetOpen(false)}
              aria-label={i18n.resolve("common.close", "Close").text}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </header>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 lg:contents"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            {active ? (
              <ReservationPanel
                key={active.id}
                reservation={active}
                property={properties.get(active.listingId)}
                data={data}
                action={actionById.get(active.id) ?? null}
                initialCountdown={(() => {
                  const item = actionById.get(active.id);
                  return item?.dueAt
                    ? formatCountdown(
                        item.dueAt.getTime() - new Date(data.now).getTime(),
                      )
                    : null;
                })()}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[0.8125rem] text-slate-500">
                {
                  i18n.resolve(
                    "host.v2.reservations.no_selection",
                    "Choose a reservation to see the guest, the money and what you can do about it.",
                  ).text
                }
              </p>
            )}
          </div>
        </aside>
      </div>

      <EntityChooserSheet
        open={chooserOpen}
        title={i18n.resolve(
          "host.v2.calendar.chooser_title",
          "Choose a property",
        )}
        items={railItems}
        allCard={allCard}
        selectedId={propertyId}
        onSelect={setPropertyId}
        onOpenChange={setChooserOpen}
        anchor={RESERVATION_ANCHOR.propertyChooser}
      />
    </div>
  );
}
