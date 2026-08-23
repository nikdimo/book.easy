"use client";

import Link from "next/link";
import {
  ArrowDownUp,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  DoorOpen,
  MessageCircle,
  Search,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HostBookingActions } from "@/components/host/host-booking-actions";
import { StartConversationButton } from "@/components/communication/start-conversation-button";
import { Avatar } from "@/components/host/v2/messages/inbox-surface";
import type {
  HostActionItem,
  HostActionKind,
} from "@/lib/host/booking-action-queue";
import { formatShortDate } from "@/lib/host/v2/calendar-format";
import {
  RESERVATION_FILTERS,
  RESERVATION_SORTS,
  type ReservationFilter,
  type ReservationSection,
  type ReservationSort,
} from "@/lib/host/v2/reservation-model";
import {
  RESERVATION_ANCHOR,
  anchorProps,
} from "@/lib/host/v2/reservation-anchors";
import type {
  HostReservation,
  HostReservationProperty,
  HostReservationsData,
} from "@/lib/host/v2/reservation-types";
import { ReservationCountdown } from "./reservation-countdown";
import {
  ROW_STATUS_PILL,
  actionChipLabel,
  actionConsequence,
  actionHeadline,
  filterLabel,
  groupHint,
  groupLabel,
  money,
  rowStatusLabel,
  rowStatusOf,
  sortLabel,
  stayLine,
  type Translator,
} from "./reservation-labels";

/**
 * The middle pane: what is happening, in the order it needs the host.
 *
 * The queue is not a banner above this list — it is the list's first section. A pinned
 * card that pushes the actual reservations below the fold costs the host the screen
 * they came for, and an empty "nothing needs you today" box costs them the space for
 * nothing at all. When there is no work, the section simply is not there.
 */

const KIND_ICONS: Record<HostActionKind, typeof Clock> = {
  RESPOND_TO_REQUEST: Clock,
  REPLY_TO_GUEST: MessageCircle,
  PREPARE_CHECK_IN: DoorOpen,
  RATE_GUEST: Star,
};

export interface ActionCardModel {
  reservation: HostReservation;
  item: HostActionItem;
  /** Rendered on the server so the first client paint matches the SSR markup. */
  initialCountdown: string | null;
}

/**
 * Whose stay this is.
 *
 * The guest leads a row because the property no longer can: the rail already says which
 * property is being looked at, and repeating its name and photo down every row spent the
 * widest column in the panel on the one fact the host had just chosen. A person's name is
 * never translated, and never machine-translated either.
 */
function guestName(reservation: HostReservation, i18n: Translator): string {
  return (
    reservation.guest.name ||
    i18n.resolve("conversation.deleted_user", "Deleted user").text
  );
}

/** The date block on the left of a row: the month, then the day, nothing else. */
function DateChip({
  ymd,
  data,
  muted,
}: {
  ymd: string;
  data: HostReservationsData;
  muted: boolean;
}) {
  const [, month, day] = ymd.split("-").map(Number);
  return (
    <span className="w-9 shrink-0 text-center leading-tight" translate="no">
      <span className="block text-[0.625rem] font-bold uppercase tracking-wide text-slate-400">
        {data.formats.date.monthShort[month - 1]}
      </span>
      <span
        className={cn(
          "block text-[1.0625rem] font-semibold tabular-nums",
          muted ? "text-slate-400" : "text-slate-800",
        )}
      >
        {String(day).padStart(2, "0")}
      </span>
    </span>
  );
}

function MessageGuestButton({
  reservation,
  label,
  variant = "outline",
}: {
  reservation: HostReservation;
  label: string;
  variant?: "default" | "outline" | "ghost";
}) {
  // An existing thread belongs in the host panel's own inbox. Only a booking that has
  // never had one needs the endpoint that creates it.
  if (reservation.conversationId) {
    return (
      <Button asChild variant={variant} size="sm">
        <Link href={`/host/messages/${reservation.conversationId}`}>
          <MessageCircle className="size-3.5" aria-hidden />
          {label}
        </Link>
      </Button>
    );
  }
  return (
    <StartConversationButton
      bookingId={reservation.id}
      variant={variant}
      label={label}
    />
  );
}

function ActionCard({
  card,
  data,
  property,
  showProperty,
  active,
  onSelect,
}: {
  card: ActionCardModel;
  data: HostReservationsData;
  property: HostReservationProperty | undefined;
  /** False once the rail has been narrowed to one property, which then says it instead. */
  showProperty: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const i18n = useI18n();
  const { reservation, item } = card;
  const Icon = KIND_ICONS[item.kind];
  const critical = item.urgency === "critical";
  const headline = actionHeadline(i18n, item.kind, reservation, data.today);
  const consequence = actionConsequence(i18n, item.kind);
  const stay = stayLine(i18n, reservation);

  return (
    <article
      className={cn(
        // No borders and no ring: attention and selection are both said with a fill,
        // exactly as the property rail says them. An outline on the selected card gave
        // the panel two competing ways of marking the same thing.
        "rounded-xl p-2.5 transition-colors",
        critical
          ? active
            ? "bg-[#e2e8f0]"
            : "bg-[#f1f5f9] hover:bg-[#e2e8f0]"
          : active
            ? "bg-[#f1f5f9]"
            : "bg-[#f8fafc] hover:bg-[#f1f5f9]",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
            critical ? "bg-[#0f172a] text-white" : "bg-white/80 text-[#334155]",
            headline.translated && "notranslate",
          )}
        >
          <Icon className="size-3" aria-hidden />
          {headline.text}
          {item.kind === "RESPOND_TO_REQUEST" && item.dueAt ? (
            <ReservationCountdown
              dueAt={item.dueAt.toISOString()}
              initial={card.initialCountdown ?? ""}
            />
          ) : null}
        </span>
        {item.alsoNeeds.map((kind) => {
          const chip = actionChipLabel(i18n, kind);
          return (
            <span
              key={kind}
              className={cn(
                "inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[0.6875rem] text-slate-600",
                chip.translated && "notranslate",
              )}
            >
              {chip.text}
            </span>
          );
        })}
        <span
          className="ml-auto text-[0.6875rem] text-slate-400"
          translate="no"
        >
          {reservation.reference}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
        >
          <Avatar
            name={reservation.guest.name}
            image={reservation.guest.image}
            className="size-11"
          />
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[0.8125rem] font-semibold text-slate-900 notranslate"
              translate="no"
            >
              {guestName(reservation, i18n)}
            </span>
            <span className="mt-0.5 block truncate text-[0.75rem] text-slate-600">
              {showProperty ? (
                <>
                  <span data-user-generated-content translate="yes">
                    {property?.title ?? ""}
                  </span>{" "}
                  ·{" "}
                </>
              ) : null}
              {stay.text} ·{" "}
              {formatShortDate(reservation.checkIn, data.formats)} –{" "}
              {formatShortDate(reservation.checkOut, data.formats)} ·{" "}
              <span className="font-semibold text-slate-800">
                {money(reservation.total, reservation.currency, data.formats)}
              </span>
            </span>
          </span>
        </button>
        {/* Rating rides beside the stay line rather than under it: a whole action row
            for one quiet, optional task cost the card an extra band of height. */}
        {item.kind === "RATE_GUEST" ? (
          <Link
            href={`/account/bookings/${reservation.id}/after-stay`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.71875rem] font-semibold text-[#334155] transition-colors hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
          >
            <Star className="size-3.5" aria-hidden />
            {
              i18n.resolve("host.v2.reservations.leave_rating", "Leave rating")
                .text
            }
          </Link>
        ) : null}
      </div>

      {consequence ? (
        <p
          className={cn(
            "mt-1.5 text-[0.71875rem] leading-4",
            critical ? "text-[#0f172a]" : "text-slate-600",
            consequence.translated && "notranslate",
          )}
        >
          {consequence.text}
        </p>
      ) : null}

      {item.kind === "RATE_GUEST" ? null : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.kind === "RESPOND_TO_REQUEST" ? (
            <>
              {/* The same dialogs the rest of the app decides a request with: accepting
                and declining are irreversible, so they are never a bare click here. */}
              <HostBookingActions bookingId={reservation.id} />
              <MessageGuestButton
                reservation={reservation}
                variant="ghost"
                label={
                  i18n.resolve(
                    "host.v2.reservations.message_guest",
                    "Message guest",
                  ).text
                }
              />
            </>
          ) : item.kind === "REPLY_TO_GUEST" ? (
            <MessageGuestButton
              reservation={reservation}
              variant="default"
              label={
                interpolate(
                  i18n.plural(
                    "host.v2.reservations.read_messages",
                    reservation.unreadCount,
                    "Read {n} message",
                    "Read {n} messages",
                  ),
                  {},
                ).text
              }
            />
          ) : (
            <>
              <Button type="button" size="sm" onClick={onSelect}>
                <CalendarCheck className="size-3.5" aria-hidden />
                {
                  i18n.resolve(
                    "host.v2.reservations.review_arrival",
                    "Review arrival",
                  ).text
                }
              </Button>
              <MessageGuestButton
                reservation={reservation}
                variant="ghost"
                label={
                  i18n.resolve(
                    "host.v2.reservations.message_guest",
                    "Message guest",
                  ).text
                }
              />
            </>
          )}
        </div>
      )}
    </article>
  );
}

function ReservationRow({
  reservation,
  data,
  property,
  showProperty,
  active,
  onSelect,
}: {
  reservation: HostReservation;
  data: HostReservationsData;
  property: HostReservationProperty | undefined;
  /** False once the rail has been narrowed to one property, which then says it instead. */
  showProperty: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const i18n = useI18n();
  const code = rowStatusOf(reservation, data.today);
  const closed = code === "CLOSED";
  const status = rowStatusLabel(i18n, code, reservation);
  const stay = stayLine(i18n, reservation);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
        active ? "bg-[#f1f5f9]" : "hover:bg-slate-50",
        // History recedes rather than competing with work, but never so far that it
        // cannot be read.
        closed && "opacity-70",
      )}
    >
      <DateChip ymd={reservation.checkIn} data={data} muted={closed} />
      <Avatar
        name={reservation.guest.name}
        image={reservation.guest.image}
        className="size-9"
      />
      <span className="min-w-0 flex-1">
        {/* Never struck through, whatever became of the booking: a line through a
            person's name reads as something said about the person. */}
        <span
          className={cn(
            "block truncate text-[0.8125rem] font-semibold text-slate-900 notranslate",
            closed && "font-medium text-slate-500",
          )}
          translate="no"
        >
          {guestName(reservation, i18n)}
        </span>
        <span className="mt-0.5 block truncate text-[0.71875rem] text-slate-500">
          {showProperty ? (
            <>
              <span data-user-generated-content translate="yes">
                {property?.title ?? ""}
              </span>{" "}
              ·{" "}
            </>
          ) : null}
          {stay.text} ·{" "}
          {formatShortDate(reservation.checkIn, data.formats)} –{" "}
          {formatShortDate(reservation.checkOut, data.formats)}
        </span>
      </span>
      <span
        className={cn(
          "hidden shrink-0 text-[0.8125rem] font-semibold tabular-nums sm:block",
          closed ? "text-slate-400" : "text-slate-800",
        )}
        translate="no"
      >
        {money(reservation.total, reservation.currency, data.formats)}
      </span>
      <span
        className={cn(
          "hidden shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold md:inline-block",
          ROW_STATUS_PILL[code],
          status.translated && "notranslate",
        )}
      >
        {status.text}
      </span>
      <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden />
    </button>
  );
}

function GroupHeading({
  label,
  hint,
  urgent,
}: {
  label: string;
  hint: string | null;
  urgent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 pb-1 pt-3 first:pt-0">
      <h3
        className={cn(
          "text-[0.6875rem] font-bold uppercase tracking-wider",
          urgent ? "text-[#0f172a]" : "text-slate-400",
        )}
      >
        {label}
      </h3>
      {hint ? (
        <span className="text-[0.6875rem] text-slate-400">{hint}</span>
      ) : null}
      <span className="h-px flex-1 bg-slate-100" aria-hidden />
    </div>
  );
}

export function ReservationStream({
  data,
  properties,
  showProperty,
  sections,
  actionCards,
  counts,
  filter,
  sort,
  query,
  activeId,
  onFilterChange,
  onSortChange,
  onQueryChange,
  onSelect,
}: {
  data: HostReservationsData;
  properties: ReadonlyMap<string, HostReservationProperty>;
  /**
   * False once the rail has been narrowed to one property. The rows then drop the
   * property name entirely rather than repeating the host's own choice back at them.
   */
  showProperty: boolean;
  sections: ReservationSection[];
  /** Empty when the queue is not being shown, not merely when there is no work. */
  actionCards: ActionCardModel[];
  counts: Record<ReservationFilter, number>;
  filter: ReservationFilter;
  sort: ReservationSort;
  query: string;
  activeId: string | null;
  onFilterChange: (filter: ReservationFilter) => void;
  onSortChange: (sort: ReservationSort) => void;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
}) {
  const i18n = useI18n();
  const empty = sections.length === 0 && actionCards.length === 0;

  return (
    <section
      {...anchorProps(RESERVATION_ANCHOR.stream)}
      className="flex min-w-0 flex-1 flex-col md:min-h-0"
    >
      <div
        {...anchorProps(RESERVATION_ANCHOR.controls)}
        className="flex shrink-0 items-center gap-2 pb-2"
      >
        {/* Exactly the height an outline `size="sm"` button is, on both sides of the
            `md` breakpoint, so the field and the sort button sit on one line without
            either of them looking clipped. */}
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 transition-colors focus-within:border-[#0f172a] md:h-7">
          <Search className="size-3.5 shrink-0 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={
              i18n.resolve(
                "host.v2.reservations.search_placeholder",
                "Search guest, property or reference…",
              ).text
            }
            className="min-w-0 flex-1 bg-transparent text-[0.8125rem] outline-none placeholder:text-slate-400"
          />
        </label>
        {/* The panel's own menu, the same one the listings overview uses, on the same
            outline button the calendar's month controls are. A form select was the
            wrong instrument: this changes the order of a list, it does not fill in a
            field, and the browser's native menu belongs to neither this panel nor the
            rest of the app. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={
                interpolate(
                  i18n.resolve(
                    "host.v2.reservations.sort_label",
                    "Sort reservations — currently {sort}",
                  ),
                  { sort: sortLabel(i18n, sort).text },
                ).text
              }
            >
              <ArrowDownUp className="size-3.5 text-slate-400" aria-hidden />
              {/* The current order is the useful half of this control, so it is the
                  half that survives a narrow viewport. */}
              <span className="hidden sm:inline">
                {sortLabel(i18n, sort).text}
              </span>
              <ChevronDown className="size-3.5 text-slate-400" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              {i18n.resolve("host.v2.reservations.sort_by", "Sort by").text}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => onSortChange(value as ReservationSort)}
            >
              {RESERVATION_SORTS.map((value) => {
                const label = sortLabel(i18n, value);
                return (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    className={label.translated ? "notranslate" : undefined}
                  >
                    {label.text}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        {...anchorProps(RESERVATION_ANCHOR.filters)}
        className="flex shrink-0 flex-wrap items-center gap-1.5 pb-2"
      >
        {RESERVATION_FILTERS.map((value) => {
          // A chip for a slice that does not exist is a dead control. "All" always
          // stays so there is a way back from an empty search.
          if (counts[value] === 0 && value !== "all" && value !== filter)
            return null;
          const label = filterLabel(i18n, value);
          const selected = filter === value;
          const urgent = value === "action";
          return (
            <button
              key={value}
              type="button"
              onClick={() => onFilterChange(value)}
              aria-pressed={selected}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
                selected
                  ? "bg-slate-900 text-white"
                  : urgent
                    ? "bg-[#f1f5f9] text-[#0f172a] hover:bg-[#e2e8f0]"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70",
                label.translated && "notranslate",
              )}
            >
              {label.text}
              <span
                className={cn(
                  "tabular-nums",
                  selected ? "opacity-70" : urgent ? "font-bold" : "opacity-60",
                )}
                translate="no"
              >
                {counts[value]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain pb-1">
        {actionCards.length > 0 ? (
          <div {...anchorProps(RESERVATION_ANCHOR.actionQueue)}>
            <GroupHeading
              label={groupLabel(i18n, "action").text}
              hint={groupHint(i18n, "action")?.text ?? null}
              urgent
            />
            <div className="flex flex-col gap-1.5">
              {actionCards.map((card) => (
                <ActionCard
                  key={card.reservation.id}
                  card={card}
                  data={data}
                  property={properties.get(card.reservation.listingId)}
                  showProperty={showProperty}
                  active={activeId === card.reservation.id}
                  onSelect={() => onSelect(card.reservation.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {sections.map((section) => (
          <div key={section.group}>
            <GroupHeading
              label={groupLabel(i18n, section.group).text}
              hint={groupHint(i18n, section.group)?.text ?? null}
            />
            <div className="flex flex-col gap-0.5">
              {section.reservations.map((reservation) => (
                <ReservationRow
                  key={reservation.id}
                  reservation={reservation}
                  data={data}
                  property={properties.get(reservation.listingId)}
                  showProperty={showProperty}
                  active={activeId === reservation.id}
                  onSelect={() => onSelect(reservation.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {empty ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="text-[0.8125rem] font-medium text-slate-700">
              {
                i18n.resolve(
                  "host.v2.reservations.empty_title",
                  "Nothing matches what you are looking for.",
                ).text
              }
            </p>
            <p className="mt-1 text-[0.75rem] text-slate-500">
              {
                i18n.resolve(
                  "host.v2.reservations.empty_body",
                  "Try a different search, or clear the filter to see every reservation.",
                ).text
              }
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
