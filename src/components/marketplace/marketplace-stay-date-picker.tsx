"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  addDays,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfToday,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import { DayButton, getDefaultClassNames, type Locale } from "react-day-picker";
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  LogOut,
  Minus,
  Plus,
  Search,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { datesStepDestination, guestStepDestination } from "@/lib/booking-flow";
import { isValidYmd, ymdToLocalDate } from "@/lib/utils/date-only";
import {
  blockedRangeStarts,
  disabledRangesForSelection,
  isBlockedDay,
  isCheckoutBoundaryDay,
  isDeadEndCheckIn,
  selectionCheckoutBoundary,
} from "@/lib/utils/booking-calendar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GuestCounts } from "@/components/marketplace/marketplace-guest-selector";
import { interpolate, pluralText, useI18n } from "@/lib/i18n/client";
import { useSearchLabels } from "@/components/marketplace/search-labels";
import type { SearchLabels } from "@/components/marketplace/search-labels";
import type { Resolved } from "@/lib/i18n/t";
import { dayPickerLocaleFor } from "@/lib/i18n/day-picker-locale";

function parseLocalYmd(s: string): Date | undefined {
  return isValidYmd(s) ? ymdToLocalDate(s) : undefined;
}

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function formatMonthDay(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(d);
}

function suppressNextClick() {
  const handler = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  document.addEventListener("click", handler, { once: true, capture: true });
  const timer = window.setTimeout(
    () => document.removeEventListener("click", handler, { capture: true }),
    300,
  );
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("click", handler, { capture: true });
  };
}

/** Inline rather than a Tailwind arbitrary value: the theme exposes colours as whole
 *  `color` values, not raw channels, so alpha has to go through `color-mix`. */
const MINIMUM_STAY_HATCH: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0, transparent 3px, color-mix(in srgb, var(--muted-foreground) 28%, transparent) 3px, color-mix(in srgb, var(--muted-foreground) 28%, transparent) 4px)",
};

/**
 * A price the way a cell should draw it: the currency symbol a size down and a shade
 * back, the amount at full size. Two characters of symbol in front of five of number
 * is a third of the line spent on something every other cell repeats.
 */
function CellPrice({
  text,
  symbol,
}: {
  text: string;
  symbol?: string;
}): React.ReactElement {
  if (!symbol || !text.startsWith(symbol)) return <>{text}</>;
  return (
    <>
      <span className="text-[0.85em] opacity-75">{symbol}</span>
      {text.slice(symbol.length)}
    </>
  );
}

/**
 * The tint that spans the nights between check-in and check-out.
 *
 * Painted as a pseudo-element rather than a background utility for two reasons: the
 * host lens puts its own `background-color` modifier (manualBlock/bookingHold) on this
 * same cell, and a separate layer can't lose a Tailwind class-order tie against it;
 * and insetting the band vertically leaves the endpoint circles standing proud of it,
 * so the eye lands on the two dates rather than on the band between them.
 */
const RANGE_BAND =
  "before:pointer-events-none before:absolute before:inset-x-0 before:inset-y-[3px] before:z-0 before:bg-[hsl(30_12%_93%)] before:content-[''] hover:before:bg-[hsl(30_12%_89%)] md:before:inset-y-[14%]";

/**
 * The host lens paints its own state on the cell — the blocked/closed hatch sits in
 * the cell's `after` layer — and the guest band, a near-white tint under that layer,
 * disappeared under it: a drawn range read as two endpoint circles with nothing in
 * between. Host surfaces get an accent-tinted band lifted above the hatch (still
 * below the `z-10` day button, so the number and its sublabel stay legible).
 */
const HOST_RANGE_BAND =
  "before:pointer-events-none before:absolute before:inset-x-0 before:inset-y-[3px] before:z-[1] before:bg-primary/20 before:content-[''] hover:before:bg-primary/25 md:before:inset-y-[14%]";

type Layout = "pill" | "hero" | "compact" | "field";
/**
 * The steps a stay picker can be on.
 *
 * `review` is optional and entirely the caller's: the picker knows only that it comes
 * after the guests and that the caller draws it. The booking flow uses it to end where
 * it began — one overlay from the first date to the sent request — while search, which
 * has nothing to review, never turns it on.
 */
type Step = "dates" | "guests" | "review";

type MarketplaceDayMeta = {
  sublabel?: string;
  /** The currency symbol the sublabels begin with, where they carry one — the card
   * cells draw it smaller than the amount it belongs to. */
  sublabelSymbol?: string;
  isCustomPrice?: boolean;
  // The host calendar reuses this cell for three different lenses, so the sublabel
  // is not always a price. `isCustomPrice` stays as the marketplace-side shorthand
  // for the primary tone.
  sublabelTone?: "muted" | "primary" | "amber";
  /** The price this night was struck down from, when a promotion applies to it. Set
   * only where the discount holds for a stay of any length — see computeDayRate. */
  sublabelOriginal?: string;
};

type DragCtx = {
  hasRange: boolean;
  onEndpointPointerDown: (
    edge: "from" | "to",
    date: Date,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  /** Only set where drag-to-select is enabled; absent means taps only. */
  onDayPointerDown?: (
    date: Date,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  dayMeta?: (date: Date) => MarketplaceDayMeta | undefined;
  dayVariant?: "default" | "availability" | "listing" | "booking";
  /** Paged (two-month, desktop-scale) grid: cells are big enough that the day circle
   *  sits inside the cell with breathing room instead of filling it. */
  paged?: boolean;
  dayBlock?: (date: Date) => DayBlock | undefined;
  /** The first day that satisfies the minimum stay, once a check-in is picked. Marked
   *  on the grid so the greyed band reads as a span between two known points. */
  isEarliestCheckout?: (date: Date) => boolean;
  earliestCheckoutLabel?: Resolved;
  /** The start day of the next booked range, which the pending stay may still check
   *  out on. Enabled only while a check-in is pending, so it never reads as a
   *  bookable arrival day. */
  isCheckoutBoundary?: (date: Date) => boolean;
  checkoutBoundaryLabel?: Resolved;
  /** Fired when a day blocked by the minimum stay is pressed. Touch users get no
   *  tooltip, so the picker answers the tap by flashing the same reason as a banner. */
  onMinimumStayBlocked?: (block: DayBlock) => void;
};

/**
 * A day that is *available* but that the minimum stay still rules out. Two shapes:
 * `minimum-stay` is a too-early check-out inside the pending stay window;
 * `too-short-gap` is a check-in whose run of free nights ends before the minimum is
 * reached, which would otherwise let the guest start a stay they can never finish.
 */
export type DayBlock = {
  kind: "minimum-stay" | "too-short-gap";
  message: Resolved;
};

/**
 * "Any dates" — the guest has no fixed window at all, as opposed to a ±N-day window
 * around the range they picked. Negative so it can never be read as a day count.
 */
export const FLEXIBILITY_ANY = -1;

/** Straight on the row; everything larger lives behind the Custom dropdown. */
const FLEXIBILITY_QUICK_VALUES = [0, 1, 2] as const;
const FLEXIBILITY_CUSTOM_VALUES = [3, 4, 5, 6, 7, 10, 14] as const;

export const FLEXIBILITY_VALUES = [
  FLEXIBILITY_ANY,
  ...FLEXIBILITY_QUICK_VALUES,
  ...FLEXIBILITY_CUSTOM_VALUES,
] as const;

export function isFlexibilityValue(value: number): boolean {
  return (FLEXIBILITY_VALUES as readonly number[]).includes(value);
}

function flexibilityLabel(labels: SearchLabels, value: number): Resolved {
  // The long-standing values keep their own keys so their existing translations are
  // not thrown away; only the windows added with the Custom menu fall back to the
  // generic plural form.
  switch (value) {
    case FLEXIBILITY_ANY:
      return labels.anyDatesFlexible;
    case 0:
      return labels.exactDates;
    case 1:
      return labels.flexible1;
    case 2:
      return labels.flexible2;
    case 3:
      return labels.flexible3;
    case 7:
      return labels.flexible7;
    case 14:
      return labels.flexible14;
    default:
      return pluralText(labels.flexibleDay, value, labels.locale);
  }
}

const FLEXIBILITY_PILL =
  "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors";
// A bare outline was almost invisible next to the unselected pills, so the active
// flexibility reads as a filled chip instead.
const FLEXIBILITY_PILL_ON =
  "border-foreground bg-foreground text-background hover:bg-foreground";
const FLEXIBILITY_PILL_OFF =
  "border-border bg-background text-foreground hover:bg-muted/40";
const PILL_STEP_ACTION =
  "h-10 w-[8.75rem] shrink-0 justify-center rounded-full border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-none transition-colors hover:bg-primary/90 md:h-10";

export function DateFlexibilityRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const labels = useSearchLabels();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const menuValues = [FLEXIBILITY_ANY, ...FLEXIBILITY_CUSTOM_VALUES];
  const menuActive = menuValues.includes(value);
  // The trigger doubles as the readout: once something is picked from the menu the pill
  // shows it, so the row never hides the current selection behind the word "Custom".
  const menuLabel = menuActive
    ? flexibilityLabel(labels, value)
    : labels.customDates;

  // Touch already pans an overflowing row; a mouse does not. On a narrow window the
  // pills are otherwise unreachable, so grabbing the row scrolls it. A press that never
  // travels stays a plain click on the pill underneath.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    const track = scrollRef.current;
    if (!track || track.scrollWidth <= track.clientWidth) return;

    const startX = e.clientX;
    const startScrollLeft = track.scrollLeft;
    let dragged = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!dragged && Math.abs(dx) < 5) return;
      dragged = true;
      track.scrollLeft = startScrollLeft - dx;
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (dragged) suppressNextClick();
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  return (
    // The scroller lives here rather than in each caller's wrapper, so every surface
    // that renders this row can reach every pill on a narrow screen.
    <div
      ref={scrollRef}
      onPointerDown={handlePointerDown}
      className="-mx-1 overflow-x-auto overflow-y-hidden px-1 py-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x"
    >
      <div className="flex w-max items-center gap-2 whitespace-nowrap">
        {FLEXIBILITY_QUICK_VALUES.map((optionValue) => {
          const label = flexibilityLabel(labels, optionValue);
          return (
            <button
              key={optionValue}
              type="button"
              onClick={() => onChange(optionValue)}
              className={cn(
                FLEXIBILITY_PILL,
                optionValue === 0 && "h-10 w-[8.75rem] justify-center",
                value === optionValue
                  ? FLEXIBILITY_PILL_ON
                  : FLEXIBILITY_PILL_OFF,
                label.translated && "notranslate",
              )}
            >
              {label.text}
            </button>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              FLEXIBILITY_PILL,
              "flex items-center gap-1.5",
              menuActive ? FLEXIBILITY_PILL_ON : FLEXIBILITY_PILL_OFF,
              menuLabel.translated && "notranslate",
            )}
          >
            {menuLabel.text}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-auto min-w-[9rem] rounded-2xl border border-border/60 p-1.5 shadow-[0_10px_32px_rgba(0,0,0,0.16)]"
          >
            {/* "I'm flexible" lives in the menu rather than on the row: it is the least
                used option and the longest label, so on a phone it was the one pill that
                pushed the row off screen. */}
            <DropdownMenuItem
              onSelect={() => onChange(FLEXIBILITY_ANY)}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-medium",
                value === FLEXIBILITY_ANY && "bg-muted",
                labels.anyDatesFlexible.translated && "notranslate",
              )}
            >
              {labels.anyDatesFlexible.text}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="mx-1 my-1.5" />
            {FLEXIBILITY_CUSTOM_VALUES.map((optionValue) => {
              const label = flexibilityLabel(labels, optionValue);
              return (
                <DropdownMenuItem
                  key={optionValue}
                  onSelect={() => onChange(optionValue)}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-sm font-medium",
                    value === optionValue && "bg-muted",
                    label.translated && "notranslate",
                  )}
                >
                  {label.text}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// Rendering many months of custom day-buttons up front was the single biggest
// contributor to date-picker open latency (each cell carries context reads, date
// formatting, modifiers, and pointer handlers). Start small and append one desktop
// row at a time so reaching the scroll boundary never creates a large render spike.
const INITIAL_MOBILE_MONTH_COUNT = 2;
const INITIAL_DESKTOP_MONTH_COUNT = 2;
const MONTH_LOAD_STEP = 2;
const MAX_MONTH_COUNT = 24;
const EMPTY_GUEST_COUNTS: GuestCounts = {
  adults: 0,
  children: 0,
  infants: 0,
  pets: 0,
};
/** Long enough not to fire while a finger is flicking the month list past a day. */
const LONG_PRESS_MS = 300;
const CAPACITY_LABEL_KEY = "mobile.builder.capacity";
const CAPACITY_LABEL_SOURCE = "Capacity";

const DragContext = React.createContext<DragCtx | null>(null);

function getNightCount(range?: DateRange) {
  if (!range?.from || !range?.to) return 0;
  return Math.max(
    1,
    Math.round(
      (startOfDay(range.to).getTime() - startOfDay(range.from).getTime()) /
        86400000,
    ),
  );
}

function GuestRow({
  title,
  subtitle,
  value,
  onChange,
  increaseDisabled = false,
}: {
  title: Resolved;
  subtitle?: Resolved;
  value: number;
  onChange: (next: number) => void;
  increaseDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-4 last:border-b-0">
      <div className="min-w-0 pr-2">
        <p
          className={cn(
            "text-base font-medium leading-5 text-foreground",
            title.translated && "notranslate",
          )}
        >
          {title.text}
        </p>
        {subtitle ? (
          <p
            className={cn(
              "mt-0.5 text-sm leading-[1.125rem] text-muted-foreground",
              subtitle.translated && "notranslate",
            )}
          >
            {subtitle.text}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-muted"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          aria-label={`Decrease ${title.text}`}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        <span className="w-8 text-center text-base text-foreground tabular-nums">
          {value}
        </span>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-muted"
          onClick={() => onChange(Math.min(16, value + 1))}
          disabled={increaseDisabled || value >= 16}
          aria-label={`Increase ${title.text}`}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

/**
 * The single shared Adults/Children/Infants/Pets editor — reused by the stay date
 * picker's own "guests" step, the mobile Where/When/Who search flow, and the header's
 * guest popover, so the guest-count UI can't drift into three different components.
 */
export function GuestCountsStep({
  guestCounts,
  onGuestCountsChange,
  maxOccupancy,
  petsAllowed = true,
  className,
}: {
  guestCounts: GuestCounts;
  onGuestCountsChange: (next: GuestCounts) => void;
  /** Adults and children consume listing capacity; infants and pets do not. */
  maxOccupancy?: number;
  /**
   * Whether this listing's house rules take pets. False leaves the row in place —
   * a guest travelling with a dog needs to be told, not left wondering where the
   * counter went — but the party cannot gain one. Search, which is not asking about
   * any one listing, leaves it true.
   */
  petsAllowed?: boolean;
  className?: string;
}) {
  const labels = useSearchLabels();
  const i18n = useI18n();
  const occupancy = guestCounts.adults + guestCounts.children;
  const capacityReached =
    maxOccupancy !== undefined && occupancy >= maxOccupancy;
  const capacityLabel = i18n.resolve(CAPACITY_LABEL_KEY, CAPACITY_LABEL_SOURCE);
  const maximumGuestLabel =
    maxOccupancy === undefined
      ? null
      : pluralText(labels.guest, maxOccupancy, labels.locale);
  const setAdults = (adults: number) => {
    const available =
      maxOccupancy === undefined
        ? adults
        : Math.max(0, maxOccupancy - guestCounts.children);
    onGuestCountsChange({
      ...guestCounts,
      adults: Math.min(adults, available),
    });
  };
  const setChildren = (children: number) => {
    const available =
      maxOccupancy === undefined
        ? children
        : Math.max(0, maxOccupancy - guestCounts.adults);
    onGuestCountsChange({
      ...guestCounts,
      children: Math.min(children, available),
    });
  };

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-2xl bg-transparent",
        className,
      )}
    >
      <GuestRow
        title={labels.adults}
        subtitle={labels.adultsHint}
        value={guestCounts.adults}
        onChange={setAdults}
        increaseDisabled={capacityReached}
      />
      <GuestRow
        title={labels.children}
        subtitle={labels.childrenHint}
        value={guestCounts.children}
        onChange={setChildren}
        increaseDisabled={capacityReached}
      />
      {maxOccupancy !== undefined && maximumGuestLabel ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "my-3 rounded-xl border px-3 py-2.5 text-sm",
            capacityReached
              ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
              : "border-border bg-muted/30 text-muted-foreground",
          )}
        >
          <p className="font-medium">
            <span
              className={capacityLabel.translated ? "notranslate" : undefined}
            >
              {capacityLabel.text}
            </span>
            {": "}
            <span
              className={
                maximumGuestLabel.translated ? "notranslate" : undefined
              }
            >
              {maximumGuestLabel.text}
            </span>
          </p>
          <p className="mt-0.5">
            <span
              className={labels.adults.translated ? "notranslate" : undefined}
            >
              {labels.adults.text}
            </span>
            {" + "}
            <span
              className={labels.children.translated ? "notranslate" : undefined}
            >
              {labels.children.text}
            </span>
            {`: ${occupancy} / ${maxOccupancy} · `}
            <span
              className={labels.infants.translated ? "notranslate" : undefined}
            >
              {labels.infants.text}
            </span>
            {petsAllowed ? (
              <>
                {" + "}
                <span
                  className={labels.pets.translated ? "notranslate" : undefined}
                >
                  {labels.pets.text}
                </span>
              </>
            ) : null}
            {": ∞"}
          </p>
        </div>
      ) : null}
      <GuestRow
        title={labels.infants}
        subtitle={labels.infantsHint}
        value={guestCounts.infants}
        onChange={(infants) => onGuestCountsChange({ ...guestCounts, infants })}
      />
      <GuestRow
        title={labels.pets}
        subtitle={petsAllowed ? labels.petsHint : labels.petsNotAllowed}
        value={petsAllowed ? guestCounts.pets : 0}
        onChange={(pets) =>
          petsAllowed
            ? onGuestCountsChange({ ...guestCounts, pets })
            : undefined
        }
        increaseDisabled={!petsAllowed}
      />
    </div>
  );
}

function MarketplaceRangeDayButton({
  className,
  day,
  modifiers,
  locale,
  onPointerDown,
  onClick: upstreamClick,
  children,
  ...rest
}: React.ComponentProps<typeof DayButton> & {
  locale?: Partial<Locale>;
}): React.ReactElement {
  const ctx = React.useContext(DragContext);
  const defaultClassNames = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);
  const meta = ctx?.dayMeta?.(day.date);
  const block = ctx?.dayBlock?.(day.date);
  const isEarliestCheckout = ctx?.isEarliestCheckout?.(day.date) ?? false;
  const isCheckoutBoundary = ctx?.isCheckoutBoundary?.(day.date) ?? false;
  // Both mark "this day is a valid check-out, not a night you get to sleep", so they
  // share the accent ring rather than inventing a third mark for the same message.
  const marksCheckout = isEarliestCheckout || isCheckoutBoundary;
  const cardVariant =
    ctx?.dayVariant === "listing" || ctx?.dayVariant === "booking";

  void onPointerDown;

  React.useEffect(() => {
    // DayPicker may rebuild its month collection when lazy-loading. Keep its
    // keyboard focus behavior without letting focus scroll an earlier selected
    // day back into view.
    if (modifiers.focused) ref.current?.focus({ preventScroll: true });
  }, [modifiers.focused]);

  const isEndpoint =
    modifiers.range_start ||
    modifiers.range_end ||
    (modifiers.selected && !modifiers.range_middle);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;

    if (ctx?.hasRange && (modifiers.range_start || modifiers.range_end)) {
      e.preventDefault();
      const edge: "from" | "to" =
        modifiers.range_start && !modifiers.range_end ? "from" : "to";
      ctx.onEndpointPointerDown(edge, day.date, e);
      return;
    }

    if (ctx?.onDayPointerDown && !block && !modifiers.disabled) {
      ctx.onDayPointerDown(day.date, e);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (block) {
      e.preventDefault();
      e.stopPropagation();
      // A silent no-op reads as "this date is taken". Bounce the reason instead.
      ctx?.onMinimumStayBlocked?.(block);
      return;
    }
    upstreamClick?.(e);
  };

  const hintText =
    block?.message ??
    (isEarliestCheckout
      ? ctx?.earliestCheckoutLabel
      : isCheckoutBoundary
        ? ctx?.checkoutBoundaryLabel
        : undefined);

  const withMinimumStayHint = (
    button: React.ReactElement,
  ): React.ReactElement => {
    if (!hintText) return button;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            // A blocked day owns the focus stop, because its button is inert. The
            // earliest-checkout day is still selectable, so its button keeps it.
            tabIndex={block ? 0 : -1}
            aria-label={
              block
                ? `${day.date.toLocaleDateString(locale?.code ?? "en-US", {
                    dateStyle: "long",
                  })}. ${hintText.text}`
                : undefined
            }
            className={cn(
              "block size-full outline-none",
              cardVariant ? "rounded-[10px]" : "rounded-full",
              block &&
                "cursor-not-allowed focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            )}
          >
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span className={hintText.translated ? "notranslate" : undefined}>
            {hintText.text}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  };

  if (ctx?.dayVariant === "availability") {
    return withMinimumStayHint(
      <Button
        {...rest}
        ref={ref}
        variant="ghost"
        size="icon"
        data-day={toYmd(day.date)}
        data-ymd={toYmd(day.date)}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        aria-disabled={block ? true : rest["aria-disabled"]}
        tabIndex={block ? -1 : rest.tabIndex}
        className={cn(
          "group/date relative z-10 flex h-full size-auto w-full min-w-(--cell-size) flex-col items-center justify-start border-0 bg-transparent px-1 py-1 font-normal leading-none shadow-none outline-none",
          "text-foreground hover:bg-transparent hover:text-foreground",
          modifiers.outside &&
            "text-muted-foreground/40 hover:text-muted-foreground/50",
          (modifiers.disabled || block) && "cursor-not-allowed opacity-40",
          modifiers.range_middle &&
            "rounded-none bg-transparent text-foreground hover:bg-transparent",
          ctx?.hasRange &&
            (modifiers.range_start || modifiers.range_end) &&
            "touch-none cursor-grab active:cursor-grabbing select-none",
          defaultClassNames.day,
          className,
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium transition-[box-shadow,background-color,color,transform] duration-150 ease-out md:h-8 md:w-8",
            isEndpoint
              ? "bg-[hsl(0_0%_13%)] text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] group-hover/date:scale-[1.04]"
              : "text-foreground",
            !modifiers.disabled &&
              !block &&
              !isEndpoint &&
              "group-hover/date:shadow-[inset_0_0_0_1.5px_hsl(0_0%_12%)] group-focus-visible/date:shadow-[inset_0_0_0_2px_hsl(0_0%_12%)]",
          )}
        >
          {day.date.getDate()}
        </span>
        <span
          className={cn(
            "mt-1 text-[0.58rem] leading-none md:text-[0.62rem]",
            meta?.sublabelTone === "amber"
              ? "font-semibold text-amber-600"
              : meta?.sublabelTone === "primary" || meta?.isCustomPrice
                ? "font-semibold text-primary"
                : "text-muted-foreground",
            modifiers.disabled && "opacity-0",
          )}
        >
          {meta?.sublabel ?? ""}
        </span>
      </Button>,
    );
  }

  // The listing page's own calendar, which is the one surface with room for a real
  // cell rather than a circle with a caption under it. Each day is a card: the button
  // *is* the tile, so the selected run is painted per-cell and the shared `before:`
  // band is switched off for this lens (see `band`, below) — a continuous band cannot
  // cross a gap between two bordered tiles without looking like a mistake.
  if (cardVariant) {
    const price = meta?.sublabel ? meta : undefined;
    // A five-figure amount that kept its symbol ("kr13,127") is half again the width
    // of "€90" in a cell that is the same size either way. The long ones step down a
    // size rather than lose their tail to the ellipsis — and what counts as long
    // depends on the lens: the widget's cards are half the listing page's.
    const compactPrice =
      Math.max(
        price?.sublabel?.length ?? 0,
        price?.sublabelOriginal?.length ?? 0,
      ) > (ctx?.dayVariant === "listing" ? 8 : 6);
    const taken = modifiers.disabled || modifiers.unavailable;
    const inRange = modifiers.range_middle || (modifiers.selected && !isEndpoint);

    return withMinimumStayHint(
      <Button
        {...rest}
        ref={ref}
        variant="ghost"
        size="icon"
        data-day={toYmd(day.date)}
        data-ymd={toYmd(day.date)}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        aria-disabled={block ? true : rest["aria-disabled"]}
        // The hatch marks the cell itself here rather than a circle inside it, because
        // on this lens the cell is all there is.
        style={block ? MINIMUM_STAY_HATCH : undefined}
        tabIndex={block ? -1 : rest.tabIndex}
        className={cn(
          "group/date relative z-10 flex !size-full flex-col items-stretch justify-between gap-0 rounded-[10px] border px-1.5 py-1.5 text-left font-normal leading-none shadow-none outline-none transition-[background-color,border-color,color]",
          // The widget's cards are two thirds the listing page's, and a discounted
          // night stacks three lines inside them — they give the padding back, the
          // horizontal side especially: it is what the price has to fit across.
          ctx?.dayVariant === "listing" ? "md:px-2.5 md:py-2.5" : "md:px-1.5 md:py-2",
          "border-border/70 bg-card text-foreground",
          !taken &&
            !block &&
            "hover:border-foreground/30 hover:bg-muted/20 focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/20",
          // Taken and past nights recede rather than disappear: the shape of a booked
          // week is itself information a guest reads before they pick anything.
          taken && "cursor-not-allowed border-border/60 bg-muted/40 text-muted-foreground/80 hover:bg-muted/40",
          block && "cursor-not-allowed border-border/70 text-muted-foreground",
          inRange && "border-primary/30 bg-primary/[0.07] text-foreground hover:bg-primary/[0.09]",
          isEndpoint &&
            "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
          marksCheckout && !isEndpoint && "border-primary/60",
          modifiers.outside && "opacity-0",
          ctx?.hasRange &&
            (modifiers.range_start || modifiers.range_end) &&
            "touch-none cursor-grab select-none active:cursor-grabbing",
          defaultClassNames.day,
          className,
        )}
      >
        <span className="flex items-start justify-between gap-1">
          <span
            className={cn(
              "text-sm font-medium md:text-[0.9375rem]",
              modifiers.unavailable && "line-through decoration-[1.5px]",
            )}
          >
            {day.date.getDate()}
          </span>
          {/* One mark per cell, and only when it says something the price cannot:
              this night is discounted, or it can end a stay but not start one. The
              second used to live in a tooltip, which is to say nowhere on a phone. */}
          {!taken && price?.sublabelOriginal ? (
            <Tag
              className={cn(
                "size-3.5 shrink-0",
                isEndpoint ? "text-primary-foreground/80" : "text-emerald-700",
              )}
              aria-hidden="true"
            />
          ) : !taken && marksCheckout && !isEndpoint ? (
            <LogOut className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          ) : null}
        </span>

        {price ? (
          <span
            className={cn(
              // Stacked, not side by side: a discounted night carries two prices, and
              // in a currency whose symbol is a word ("CFPF11,217") two of them are
              // wider than the cell they sit in — the struck one used to run off the
              // edge of the card. What it was is a footnote to what it costs, so it
              // goes above, in the smaller type.
              "notranslate flex min-w-0 flex-col items-start gap-px leading-none",
              taken && "opacity-0",
            )}
            translate="no"
            suppressHydrationWarning
          >
            {price.sublabelOriginal ? (
              <span
                className={cn(
                  "max-w-full truncate text-[0.5625rem] line-through md:text-[0.625rem]",
                  compactPrice && "text-[0.5rem] md:text-[0.5625rem]",
                  isEndpoint
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                <CellPrice
                  text={price.sublabelOriginal}
                  symbol={price.sublabelSymbol}
                />
              </span>
            ) : null}
            <span
              className={cn(
                "max-w-full truncate text-[0.6875rem]",
                ctx?.dayVariant === "listing" ? "md:text-xs" : "md:text-[0.7rem]",
                compactPrice && "text-[0.625rem] md:text-[0.6875rem]",
                isEndpoint
                  ? "text-primary-foreground"
                  : price.sublabelOriginal
                    ? "font-semibold text-emerald-700"
                    : price.isCustomPrice
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
              )}
            >
              <CellPrice
                text={price.sublabel ?? ""}
                symbol={price.sublabelSymbol}
              />
            </span>
          </span>
        ) : null}
      </Button>,
    );
  }

  // A guest cell shows its nightly price under the number. The host lens above owns
  // its own sublabel row; this is the same idea sized for the smaller guest cell,
  // which is why it re-lays the button out instead of sharing that branch.
  const priceLabel = meta?.sublabel ? meta : undefined;

  return withMinimumStayHint(
    <Button
      {...rest}
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={toYmd(day.date)}
      data-ymd={toYmd(day.date)}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      aria-disabled={block ? true : rest["aria-disabled"]}
      tabIndex={block ? -1 : rest.tabIndex}
      className={cn(
        "group/date relative z-10 flex size-auto w-full min-w-(--cell-size) items-center justify-center border-0 bg-transparent font-normal leading-none shadow-none outline-none",
        priceLabel
          ? "aspect-auto h-full flex-col justify-center gap-px px-0.5 py-0.5"
          : "aspect-square",
        "text-foreground hover:bg-transparent hover:text-foreground",
        modifiers.outside &&
          "text-muted-foreground/40 hover:text-muted-foreground/50",
        modifiers.disabled && "cursor-not-allowed opacity-40",
        // A minimum-stay day is not "taken", so it deliberately avoids the dimming
        // that marks booked and past days — it gets a hatch instead (see below).
        // Dimming the two by different amounts was a distinction nobody could see.
        !modifiers.disabled && block && "cursor-not-allowed text-muted-foreground",
        modifiers.range_middle &&
          "rounded-none bg-transparent text-foreground hover:bg-transparent",
        ctx?.hasRange &&
          (modifiers.range_start || modifiers.range_end) &&
          "touch-none cursor-grab active:cursor-grabbing select-none",
        defaultClassNames.day,
        // A square button sized off the cell's *width* ends up shorter than the cell and
        // sits at its top, which puts the day circle a pixel or two above the centre of
        // the range band. Fill the cell instead and let flex centre the circle in it.
        ctx?.paged && "md:aspect-auto md:h-full",
        className,
      )}
    >
      <span
        // Three blocked states, three different marks, so the guest can tell at a
        // glance which rule they hit: booked/past days are dimmed and struck through,
        // minimum-stay days carry a diagonal hatch at full text contrast, and the
        // earliest valid check-out gets a ring in the accent colour.
        style={block ? MINIMUM_STAY_HATCH : undefined}
        className={cn(
          "flex size-full items-center justify-center rounded-full transition-[box-shadow,background-color,color,transform] duration-150 ease-out",
          // Sized off the cell height rather than filling the cell, so the circle stays
          // round on non-square cells, stands proud of the band it's centred on, and
          // leaves a gap between neighbouring days.
          ctx?.paged && !priceLabel && "md:size-auto md:aspect-square md:h-[86%]",
          // With a price beneath it the circle can no longer fill the cell, or it would
          // push the price out of the row.
          priceLabel &&
            "size-7 shrink-0 text-sm md:size-8 md:aspect-square md:h-8",
          modifiers.unavailable && "line-through decoration-[1.5px]",
          marksCheckout &&
            !isEndpoint &&
            "font-semibold text-primary shadow-[inset_0_0_0_1.5px_var(--primary)]",
          isEndpoint &&
            "bg-[hsl(0_0%_13%)] text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] group-hover/date:scale-[1.04] group-hover/date:bg-[hsl(0_0%_18%)]",
          !modifiers.disabled &&
            !block &&
            !isEndpoint &&
            !marksCheckout &&
            "group-hover/date:shadow-[inset_0_0_0_1.5px_hsl(0_0%_12%)] group-focus-visible/date:shadow-[inset_0_0_0_2px_hsl(0_0%_12%)]",
        )}
      >
        {children}
      </span>
      {priceLabel ? (
        <span
          className={cn(
            "notranslate flex flex-col items-center leading-none",
            // Booked and past days keep their price hidden: nothing about them is on
            // sale, and a struck-through number next to a struck-through day reads as
            // a discount.
            (modifiers.disabled || modifiers.unavailable) && "opacity-0",
          )}
          translate="no"
          suppressHydrationWarning
        >
          {priceLabel.sublabelOriginal ? (
            <span className="text-[0.5rem] text-muted-foreground line-through md:text-[0.55rem]">
              {priceLabel.sublabelOriginal}
            </span>
          ) : null}
          <span
            className={cn(
              "text-[0.55rem] md:text-[0.62rem]",
              priceLabel.sublabelOriginal
                ? "font-semibold text-green-700"
                : priceLabel.isCustomPrice
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
            )}
          >
            {priceLabel.sublabel}
          </span>
        </span>
      ) : null}
    </Button>,
  );
}

function EndpointSummary({
  label,
  value,
  active,
}: {
  label: Resolved;
  value: string | undefined;
  /** The end the next tap will set — underlined so the guest knows what they're picking. */
  active: boolean;
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
          label.translated && "notranslate",
        )}
      >
        {label.text}
      </p>
      <p
        className={cn(
          "notranslate mt-0.5 truncate text-sm font-semibold leading-tight decoration-2 underline-offset-[6px]",
          value ? "text-foreground" : "text-muted-foreground",
          active && "underline",
        )}
        translate="no"
        suppressHydrationWarning
      >
        {value ?? "—"}
      </p>
    </div>
  );
}

/**
 * The single shared calendar surface for picking a stay date range — drag-to-resize
 * endpoints, lazy month loading, matching visuals — reused by both the standalone
 * date-picker dialog and the combined search-flow dialog so they never drift apart.
 */
export function DateRangeCalendarStep({
  active,
  selected,
  onRangeChange,
  onFromOnlySelected,
  disabledDateRanges = [],
  dayMeta,
  dayVariant = "default",
  dateModifiers,
  dateModifiersClassNames,
  minimumStayNights,
  maximumStayNights,
  minimumStayMessage,
  onMinimumStayBlocked,
  fitViewport = false,
  pagedOnDesktop = false,
  pagedDesktopMonthCount = 2,
  dragToSelect = false,
  toggleSelectedRange = false,
  showEndpointHeader = false,
  priceNote,
  locale,
}: {
  active: boolean;
  selected: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
  onFromOnlySelected?: () => void;
  disabledDateRanges?: { from: Date; to: Date }[];
  dayMeta?: (date: Date) => MarketplaceDayMeta | undefined;
  dayVariant?: "default" | "availability" | "listing" | "booking";
  dateModifiers?: React.ComponentProps<typeof Calendar>["modifiers"];
  dateModifiersClassNames?: React.ComponentProps<
    typeof Calendar
  >["modifiersClassNames"];
  minimumStayNights?: number;
  /** The host's stay-length cap. A click that would complete a longer range starts a
   *  new check-in on that day instead — see commitRange. */
  maximumStayNights?: number;
  minimumStayMessage?: Resolved;
  onMinimumStayBlocked?: (block: DayBlock) => void;
  fitViewport?: boolean;
  pagedOnDesktop?: boolean;
  pagedDesktopMonthCount?: 1 | 2;
  /** Press (or long-press on touch) a day and sweep to draw a range in one gesture.
   *  Host-side only: guests keep the plain tap-in / tap-out flow. */
  dragToSelect?: boolean;
  /** Host-side convenience: clicking inside a completed selection clears it. */
  toggleSelectedRange?: boolean;
  /** Names the two endpoints and counts the nights above the grid. For surfaces that
   *  don't already carry Check in / Check out segment cards of their own. */
  showEndpointHeader?: boolean;
  /** Names the currency the day prices are in, under the grid. The cells themselves
   *  have room for the amount and not much else. */
  priceNote?: Resolved;
  locale?: string;
}) {
  const labels = useSearchLabels();
  const calendarLocale = locale ?? labels.locale;
  const resolvedCalendarLocale = dayPickerLocaleFor(calendarLocale);
  const [isMobile, setIsMobile] = React.useState(false);
  const [visibleMonthCount, setVisibleMonthCount] = React.useState(
    INITIAL_DESKTOP_MONTH_COUNT,
  );
  const [displayMonth, setDisplayMonth] = React.useState(() =>
    startOfMonth(selected?.from ?? new Date()),
  );
  const [dragDisplayRange, setDragDisplayRange] = React.useState<
    DateRange | undefined
  >(undefined);
  const [isDragging, setIsDragging] = React.useState(false);
  const clearSelectionOnNextSelectRef = React.useRef(false);
  const [canScrollBack, setCanScrollBack] = React.useState(false);
  const [pagedMonthCapacity, setPagedMonthCapacity] = React.useState<1 | 2>(1);
  const [, startMonthAppendTransition] = React.useTransition();
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);
  const wasActiveRef = React.useRef(false);
  const pendingMonthAppendScrollTopRef = React.useRef<number | null>(null);
  const pendingArrowScrollRef = React.useRef<1 | null>(null);
  const dragFrameRef = React.useRef<number | null>(null);
  const dragAutoScrollFrameRef = React.useRef<number | null>(null);
  const dragPointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const pendingDragDateRef = React.useRef<Date | null>(null);

  // "sweep" is a fresh range drawn from an anchor day; "from"/"to" move an edge of
  // the range that is already selected.
  const dragRef = React.useRef<{
    edge: "from" | "to" | "sweep";
    anchor: Date;
    currentFrom: Date;
    currentTo: Date;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const longPressRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => () => longPressRef.current?.(), []);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const pagedCalendar = fitViewport || (pagedOnDesktop && !isMobile);
  const cardDayVariant =
    dayVariant === "listing" || dayVariant === "booking";
  // `dragToSelect` is the host-only flag, and the host lenses are the ones that paint
  // hatches and tints on the same cell the band has to show through.
  // The listing lens paints the run on the cells themselves, so it takes no band —
  // a continuous strip cannot cross the gap between two bordered tiles.
  const band =
    cardDayVariant
      ? ""
      : dragToSelect
        ? HOST_RANGE_BAND
        : RANGE_BAND;
  const pagedMonthCount =
    !isMobile &&
    pagedDesktopMonthCount === 2 &&
    pagedMonthCapacity === 2
      ? 2
      : 1;

  React.useEffect(() => {
    if (!pagedCalendar || pagedDesktopMonthCount === 1) return;
    const node = bodyScrollRef.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      // Two 20rem month columns, their gap, and a little breathing room for the
      // navigation buttons. Narrow desktop windows fall back to one month without
      // relying on the viewport width (the picker can also live in a smaller shell).
      setPagedMonthCapacity(entry.contentRect.width >= 680 ? 2 : 1);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [pagedCalendar, pagedDesktopMonthCount]);

  React.useEffect(() => {
    const justOpened = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    if (!justOpened) return;

    bodyScrollRef.current?.scrollTo({ top: 0 });
    setCanScrollBack(false);
    pendingMonthAppendScrollTopRef.current = null;
    pendingArrowScrollRef.current = null;
    // Resets the visible month count each time this step becomes active, so a
    // prior expansion doesn't leak into the next open. Selection changes must
    // not reset this state: hosts often select dates in a lazily loaded month.
    setVisibleMonthCount(
      pagedCalendar
        ? INITIAL_DESKTOP_MONTH_COUNT
        : isMobile
          ? INITIAL_MOBILE_MONTH_COUNT
          : INITIAL_DESKTOP_MONTH_COUNT,
    );
    if (pagedCalendar) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayMonth(startOfMonth(selected?.from ?? new Date()));
    }
  }, [active, isMobile, pagedCalendar, selected?.from]);

  // react-day-picker recalculates its internal month collection when
  // numberOfMonths changes. Restore the scroll offset in the same layout pass
  // so appending months never produces a visible jump, even if the browser's
  // scroll anchoring or the calendar's focus management tries to reposition it.
  React.useLayoutEffect(() => {
    const scrollTop = pendingMonthAppendScrollTopRef.current;
    if (scrollTop === null) return;

    const scrollContainer = bodyScrollRef.current;
    if (scrollContainer) scrollContainer.scrollTop = scrollTop;
    pendingMonthAppendScrollTopRef.current = null;

    if (scrollContainer && pendingArrowScrollRef.current) {
      pendingArrowScrollRef.current = null;
      window.requestAnimationFrame(() => {
        scrollContainer.scrollBy({
          top: Math.max(240, scrollContainer.clientHeight * 0.8),
          behavior: "smooth",
        });
      });
    }
  }, [visibleMonthCount]);

  React.useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
      if (dragAutoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
      }
    };
  }, []);

  const hasRange = Boolean(selected?.from && selected?.to);
  const minimumStayAnchor = React.useMemo(
    () =>
      selected?.from &&
      !selected.to &&
      minimumStayNights &&
      minimumStayNights > 1
        ? startOfDay(selected.from)
        : undefined,
    [minimumStayNights, selected],
  );
  // Forward-only: a day *before* the check-in is not a too-short checkout, it is a
  // perfectly good new check-in, and blocking it just doubles the grey the guest has
  // to interpret. Tapping one restarts the range, as it already does further back.
  const isMinimumStayRestricted = React.useCallback(
    (date: Date) => {
      if (!minimumStayAnchor || !minimumStayNights) return false;
      const distance = differenceInCalendarDays(
        startOfDay(date),
        minimumStayAnchor,
      );
      return distance > 0 && distance < minimumStayNights;
    },
    [minimumStayAnchor, minimumStayNights],
  );

  const earliestCheckout = React.useMemo(
    () =>
      minimumStayAnchor && minimumStayNights
        ? addDays(minimumStayAnchor, minimumStayNights)
        : undefined,
    [minimumStayAnchor, minimumStayNights],
  );
  const isEarliestCheckout = React.useCallback(
    (date: Date) =>
      Boolean(earliestCheckout && isSameDay(startOfDay(date), earliestCheckout)),
    [earliestCheckout],
  );

  // Sorted once so the gap lookup below can stop at the first block that starts on or
  // after the candidate day instead of scanning every block for every rendered cell.
  const sortedBlockStarts = React.useMemo(
    () => blockedRangeStarts(disabledDateRanges),
    [disabledDateRanges],
  );

  const isTooShortGap = React.useCallback(
    (date: Date) => isDeadEndCheckIn(date, minimumStayNights, sortedBlockStarts),
    [minimumStayNights, sortedBlockStarts],
  );

  // Independent of `minimumStayAnchor`, which only exists for multi-night minimums: a
  // one-night listing still needs its blocked start openable as a check-out.
  //
  // Follows the selection through completion, not just while a check-in is pending —
  // otherwise clicking the boundary completed the range, dropped the exception, and
  // struck through the very day the guest had just validly chosen.
  const checkoutBoundaryDate = React.useMemo(
    () =>
      selectionCheckoutBoundary(
        selected?.from
          ? { from: startOfDay(selected.from), to: selected.to }
          : undefined,
        sortedBlockStarts,
      ),
    [selected, sortedBlockStarts],
  );
  const isCheckoutBoundary = React.useCallback(
    (date: Date) => isCheckoutBoundaryDay(date, checkoutBoundaryDate),
    [checkoutBoundaryDate],
  );
  // Everything the matcher and the "unavailable" strike-through work from. Cleared or
  // moved off the exact fit, the boundary drops back into its own block — and
  // `commitRange` below stops it becoming a check-in while the exception is live.
  const effectiveDisabledRanges = React.useMemo(
    () => disabledRangesForSelection(disabledDateRanges, checkoutBoundaryDate),
    [checkoutBoundaryDate, disabledDateRanges],
  );

  const tooShortGapMessage = React.useMemo<Resolved | undefined>(() => {
    if (!minimumStayNights || minimumStayNights < 2) return undefined;
    return interpolate(labels.minimumStayGapTooShort, { n: minimumStayNights });
  }, [labels, minimumStayNights]);

  /**
   * Mid-selection the guest is choosing a check-out, so only the minimum-stay window is
   * blocked; the dead-end rule would wrongly grey out days that are perfectly good
   * check-outs for the stay in progress. Between selections the reverse holds.
   */
  const dayBlock = React.useCallback(
    (date: Date): DayBlock | undefined => {
      if (minimumStayAnchor) {
        return minimumStayMessage && isMinimumStayRestricted(date)
          ? { kind: "minimum-stay", message: minimumStayMessage }
          : undefined;
      }
      return tooShortGapMessage && isTooShortGap(date)
        ? { kind: "too-short-gap", message: tooShortGapMessage }
        : undefined;
    },
    [
      isMinimumStayRestricted,
      isTooShortGap,
      minimumStayAnchor,
      minimumStayMessage,
      tooShortGapMessage,
    ],
  );

  const calendarStartMonth = React.useMemo(() => {
    if (dayVariant === "availability") {
      return startOfMonth(startOfToday());
    }
    return startOfMonth(selected?.from ?? new Date());
  }, [dayVariant, selected?.from]);

  const commitRange = React.useCallback(
    (range: DateRange | undefined) => {
      // A completed exact fit leaves its check-out day enabled so it stops rendering as
      // unavailable. That day is still a blocked night, so the one thing it must never
      // turn into is the *start* of a new stay. Any fresh check-in landing on a
      // genuinely blocked day drops the selection instead, which puts the day straight
      // back inside its block. Only the exception can produce this, since every other
      // blocked day is refused by the disabled matcher before it reaches here.
      if (
        range?.from &&
        !range.to &&
        isBlockedDay(range.from, disabledDateRanges)
      ) {
        onRangeChange(undefined);
        return;
      }

      // A day picked *before* the anchor is a new check-in, not a one-night stay:
      // react-day-picker would otherwise extend the range backwards and land under
      // the minimum. Only the backward side reaches here — forward days inside the
      // window are blocked on the cell itself.
      if (
        minimumStayAnchor &&
        minimumStayNights &&
        range?.from &&
        range.to &&
        differenceInCalendarDays(startOfDay(range.to), startOfDay(range.from)) <
          minimumStayNights
      ) {
        const restart = isSameDay(startOfDay(range.from), minimumStayAnchor)
          ? range.to
          : range.from;
        onRangeChange({ from: startOfDay(restart), to: undefined });
        onFromOnlySelected?.();
        return;
      }

      // The other end of the same rule. A check-out past the host's cap is read as the
      // guest starting a new stay on that day rather than as a stay nobody can book —
      // the same move the minimum makes above, and the one that keeps an over-cap range
      // from being drawn at all. Days are not greyed out to achieve it: everything
      // beyond the cap is still a perfectly good *check-in*, and disabling the rest of
      // the calendar to protect one check-out would cost the guest far more than it
      // saves. A range that arrives some other way (a shared link, a drag) is caught by
      // validateBookingSelection, which blocks the request before it is sent.
      if (
        maximumStayNights &&
        maximumStayNights >= 1 &&
        range?.from &&
        range.to &&
        differenceInCalendarDays(startOfDay(range.to), startOfDay(range.from)) >
          maximumStayNights
      ) {
        onRangeChange({ from: startOfDay(range.to), to: undefined });
        onFromOnlySelected?.();
        return;
      }

      onRangeChange(range);
      if (range?.from && !range?.to) onFromOnlySelected?.();
    },
    [
      disabledDateRanges,
      maximumStayNights,
      minimumStayAnchor,
      minimumStayNights,
      onRangeChange,
      onFromOnlySelected,
    ],
  );

  const beginDrag = React.useCallback(
    (init: {
      edge: "from" | "to" | "sweep";
      anchor: Date;
      from: Date;
      to: Date;
      startX: number;
      startY: number;
      /** A long press already committed to the gesture, so preview from the start. */
      engaged: boolean;
    }) => {
      dragRef.current = {
        edge: init.edge,
        anchor: startOfDay(init.anchor),
        currentFrom: startOfDay(init.from),
        currentTo: startOfDay(init.to),
        startX: init.startX,
        startY: init.startY,
        moved: init.engaged,
      };

      if (init.engaged) {
        setIsDragging(true);
        setDragDisplayRange({
          from: dragRef.current.currentFrom,
          to: dragRef.current.currentTo,
        });
      }

      const updateDragPreview = (nextDate: Date) => {
        const dr = dragRef.current;
        if (!dr) return;
        const d0 = startOfDay(nextDate);

        if (dr.edge === "sweep") {
          // Sweeping backwards past the anchor is the same gesture in reverse.
          const before = isBefore(d0, dr.anchor);
          dr.currentFrom = before ? d0 : dr.anchor;
          dr.currentTo = before ? dr.anchor : d0;
        } else if (dr.edge === "from") {
          if (
            isAfter(d0, dr.currentTo) ||
            isSameDay(d0, dr.currentTo) ||
            isSameDay(d0, dr.currentFrom)
          ) {
            return;
          }
          dr.currentFrom = d0;
        } else {
          if (
            isBefore(d0, dr.currentFrom) ||
            isSameDay(d0, dr.currentFrom) ||
            isSameDay(d0, dr.currentTo)
          ) {
            return;
          }
          dr.currentTo = d0;
        }

        setDragDisplayRange({ from: dr.currentFrom, to: dr.currentTo });
      };

      const updateDateUnderPointer = (clientX: number, clientY: number) => {
        const element = document.elementFromPoint(clientX, clientY);
        const ymd = element?.closest?.("[data-ymd]")?.getAttribute("data-ymd");
        if (!ymd) return;

        const nextDate = parseLocalYmd(ymd);
        if (!nextDate) return;
        const normalizedDate = startOfDay(nextDate);
        if (isBefore(normalizedDate, startOfToday())) return;
        pendingDragDateRef.current = normalizedDate;

        if (dragFrameRef.current !== null) return;
        dragFrameRef.current = window.requestAnimationFrame(() => {
          dragFrameRef.current = null;
          const pendingDate = pendingDragDateRef.current;
          pendingDragDateRef.current = null;
          if (pendingDate) updateDragPreview(pendingDate);
        });
      };

      const runEdgeAutoScroll = () => {
        dragAutoScrollFrameRef.current = null;
        const pointer = dragPointerRef.current;
        const scrollContainer = bodyScrollRef.current;
        if (!dragRef.current || !pointer || !scrollContainer) return;

        const bounds = scrollContainer.getBoundingClientRect();
        const edgeZone = Math.min(72, bounds.height * 0.18);
        let speed = 0;

        if (pointer.y < bounds.top + edgeZone) {
          speed = -14 * (1 - Math.max(0, pointer.y - bounds.top) / edgeZone);
        } else if (pointer.y > bounds.bottom - edgeZone) {
          speed = 14 * (1 - Math.max(0, bounds.bottom - pointer.y) / edgeZone);
        }

        if (Math.abs(speed) < 0.5) return;
        const previousScrollTop = scrollContainer.scrollTop;
        scrollContainer.scrollTop += speed;

        if (scrollContainer.scrollTop !== previousScrollTop) {
          updateDateUnderPointer(pointer.x, pointer.y);
        }
        // Keep the loop alive at the current boundary while lazy months render;
        // once their height is committed, the same stationary pointer continues
        // scrolling without needing a wiggle from the user.
        dragAutoScrollFrameRef.current =
          window.requestAnimationFrame(runEdgeAutoScroll);
      };

      const onMove = (ev: PointerEvent) => {
        const dr = dragRef.current;
        if (!dr) return;
        const dist = Math.hypot(ev.clientX - dr.startX, ev.clientY - dr.startY);
        if (!dr.moved && dist < 6) return;

        if (!dr.moved) {
          dr.moved = true;
          setIsDragging(true);
          setDragDisplayRange({ from: dr.currentFrom, to: dr.currentTo });
        }

        dragPointerRef.current = { x: ev.clientX, y: ev.clientY };
        updateDateUnderPointer(ev.clientX, ev.clientY);
        if (dragAutoScrollFrameRef.current === null) {
          dragAutoScrollFrameRef.current =
            window.requestAnimationFrame(runEdgeAutoScroll);
        }
      };

      // Once the sweep owns the gesture the month list must stop scrolling under it.
      // touch-action cannot be changed mid-gesture, so the move is cancelled directly;
      // the listener has to be non-passive for that to take effect.
      const blockTouchScroll = (ev: TouchEvent) => {
        if (dragRef.current?.moved && ev.cancelable) ev.preventDefault();
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        document.removeEventListener("touchmove", blockTouchScroll);

        if (dragFrameRef.current !== null) {
          window.cancelAnimationFrame(dragFrameRef.current);
          dragFrameRef.current = null;
        }
        if (dragAutoScrollFrameRef.current !== null) {
          window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
          dragAutoScrollFrameRef.current = null;
        }
        dragPointerRef.current = null;
        if (pendingDragDateRef.current) {
          updateDragPreview(pendingDragDateRef.current);
          pendingDragDateRef.current = null;
        }

        const dr = dragRef.current;
        dragRef.current = null;
        setIsDragging(false);
        setDragDisplayRange(undefined);

        // A sweep that never moved is just a tap: leave it to DayPicker's own click
        // handling so tap-start/tap-end still works exactly as before.
        if (dr?.edge === "sweep" && !dr.moved) return;

        suppressNextClick();

        if (dr?.edge === "sweep") {
          commitRange(
            isSameDay(dr.currentFrom, dr.currentTo)
              ? { from: dr.currentFrom, to: undefined }
              : { from: dr.currentFrom, to: dr.currentTo },
          );
          return;
        }

        if (dr?.moved) {
          commitRange({ from: dr.currentFrom, to: dr.currentTo });
        } else {
          commitRange({ from: dr?.anchor ?? init.anchor, to: undefined });
        }
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
      document.addEventListener("touchmove", blockTouchScroll, {
        passive: false,
      });
    },
    [commitRange],
  );

  const handleEndpointPointerDown = React.useCallback(
    (
      edge: "from" | "to",
      date: Date,
      e: React.PointerEvent<HTMLButtonElement>,
    ) => {
      const from = selected?.from;
      const to = selected?.to;
      if (!from || !to) return;

      beginDrag({
        edge,
        anchor: date,
        from,
        to,
        startX: e.clientX,
        startY: e.clientY,
        engaged: false,
      });
    },
    [beginDrag, selected],
  );

  const handleDayPointerDown = React.useCallback(
    (date: Date, e: React.PointerEvent<HTMLButtonElement>) => {
      const startX = e.clientX;
      const startY = e.clientY;
      const start = {
        edge: "sweep" as const,
        anchor: date,
        from: date,
        to: date,
        startX,
        startY,
      };

      if (e.pointerType !== "touch") {
        beginDrag({ ...start, engaged: false });
        return;
      }

      // On touch, pressing a day is also how the month list is scrolled. The sweep
      // only takes the gesture after a deliberate hold; any movement before that
      // means the finger was scrolling, so the hold is abandoned.
      const cancel = () => {
        window.clearTimeout(timer);
        document.removeEventListener("pointermove", onMoveBeforeHold);
        document.removeEventListener("pointerup", cancel);
        document.removeEventListener("pointercancel", cancel);
        longPressRef.current = null;
      };

      const onMoveBeforeHold = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) cancel();
      };

      const timer = window.setTimeout(() => {
        cancel();
        navigator.vibrate?.(10);
        beginDrag({ ...start, engaged: true });
      }, LONG_PRESS_MS);

      longPressRef.current = cancel;
      document.addEventListener("pointermove", onMoveBeforeHold);
      document.addEventListener("pointerup", cancel);
      document.addEventListener("pointercancel", cancel);
    },
    [beginDrag],
  );

  /** The guest cell only grows for prices; the host lens has its own sublabel row. */
  const showsDayPrices = dayVariant !== "availability" && Boolean(dayMeta);

  const dragCtx = React.useMemo<DragCtx>(
    () => ({
      hasRange,
      onEndpointPointerDown: handleEndpointPointerDown,
      onDayPointerDown: dragToSelect ? handleDayPointerDown : undefined,
      dayMeta,
      dayVariant,
      paged: pagedCalendar,
      dayBlock,
      isEarliestCheckout,
      earliestCheckoutLabel: earliestCheckout
        ? labels.earliestCheckout
        : undefined,
      isCheckoutBoundary,
      checkoutBoundaryLabel: checkoutBoundaryDate ? labels.checkOut : undefined,
      onMinimumStayBlocked,
    }),
    [
      checkoutBoundaryDate,
      dayBlock,
      dayMeta,
      dayVariant,
      dragToSelect,
      earliestCheckout,
      handleDayPointerDown,
      handleEndpointPointerDown,
      hasRange,
      isCheckoutBoundary,
      isEarliestCheckout,
      labels,
      onMinimumStayBlocked,
      pagedCalendar,
    ],
  );

  const calendarSelected = dragDisplayRange ?? selected;
  const showEndpointSummary = showEndpointHeader && pagedCalendar;
  const summaryFrom = calendarSelected?.from
    ? formatMonthDay(calendarSelected.from, calendarLocale)
    : undefined;
  const summaryTo = calendarSelected?.to
    ? formatMonthDay(calendarSelected.to, calendarLocale)
    : undefined;
  const summaryNightCount = getNightCount(calendarSelected);
  const summaryNights =
    summaryNightCount > 0
      ? pluralText(labels.night, summaryNightCount, labels.locale)
      : undefined;
  const disabledMatcher = React.useMemo(
    () => [{ before: startOfToday() }, ...effectiveDisabledRanges],
    [effectiveDisabledRanges],
  );

  // `disabled` also covers past days, so booked days need their own modifier before
  // the day cell can mark them — and only them — as unavailable. The host lens paints
  // its own blocked backgrounds and opts out.
  const calendarModifiers = React.useMemo(
    () =>
      dayVariant === "availability" || effectiveDisabledRanges.length === 0
        ? dateModifiers
        : { ...dateModifiers, unavailable: effectiveDisabledRanges },
    [dateModifiers, dayVariant, effectiveDisabledRanges],
  );

  const scrollCalendar = React.useCallback(
    (direction: -1 | 1) => {
      const scrollContainer = bodyScrollRef.current;
      if (!scrollContainer) return;

      const scrollAmount = Math.max(240, scrollContainer.clientHeight * 0.8);
      const isNearEnd =
        scrollContainer.scrollTop + scrollContainer.clientHeight >=
        scrollContainer.scrollHeight - 48;

      if (direction === 1 && isNearEnd && visibleMonthCount < MAX_MONTH_COUNT) {
        pendingMonthAppendScrollTopRef.current = scrollContainer.scrollTop;
        pendingArrowScrollRef.current = 1;
        startMonthAppendTransition(() => {
          setVisibleMonthCount((current) =>
            Math.min(MAX_MONTH_COUNT, current + MONTH_LOAD_STEP),
          );
        });
        return;
      }

      scrollContainer.scrollBy({
        top: direction * scrollAmount,
        behavior: "smooth",
      });
    },
    [visibleMonthCount],
  );

  return (
    <DragContext.Provider value={dragCtx}>
      <div
        ref={bodyScrollRef}
        onScroll={(e) => {
          if (pagedCalendar) return;
          const el = e.currentTarget;
          setCanScrollBack(el.scrollTop > 8);
          if (
            pendingMonthAppendScrollTopRef.current === null &&
            visibleMonthCount < MAX_MONTH_COUNT &&
            el.scrollTop + el.clientHeight >= el.scrollHeight - 320
          ) {
            pendingMonthAppendScrollTopRef.current = el.scrollTop;
            startMonthAppendTransition(() => {
              setVisibleMonthCount((current) =>
                Math.min(MAX_MONTH_COUNT, current + MONTH_LOAD_STEP),
              );
            });
          }
        }}
        className={cn(
          pagedCalendar
            ? "flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-auto px-5 py-4 md:px-10 md:pt-8 md:pb-4"
            : "flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [overflow-anchor:none] px-4 py-5 md:px-6 md:py-6",
          isDragging && "cursor-grabbing select-none",
        )}
      >
        {!pagedCalendar ? (
          <div className="pointer-events-none sticky top-2 z-20 -mb-9 flex h-9 items-center justify-between">
            <button
              type="button"
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
              onClick={() => scrollCalendar(-1)}
              disabled={!canScrollBack}
              aria-label={labels.back.text}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted"
              onClick={() => scrollCalendar(1)}
              aria-label={labels.next.text}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {showEndpointSummary ? (
          // Two black circles say nothing about which end is which — least of all when
          // the picker is reopened on a range chosen earlier. Name them, and count the
          // nights so nobody has to count cells.
          <div
            className={cn(
              "mx-auto mb-4 flex w-full items-end justify-between gap-4 md:mb-5",
              pagedMonthCount === 2 ? "max-w-[58.5rem]" : "max-w-[24rem]",
            )}
          >
            <div className="flex min-w-0 items-end gap-8">
              <EndpointSummary
                label={labels.checkIn}
                value={summaryFrom}
                // Only while a pick is in progress — underlining an endpoint of a
                // finished range marks nothing, it just looks like stray decoration.
                active={!selected?.from}
              />
              <EndpointSummary
                label={labels.checkOut}
                value={summaryTo}
                active={Boolean(selected?.from) && !selected?.to}
              />
            </div>
            {summaryNights ? (
              <span
                className={cn(
                  "shrink-0 text-sm text-muted-foreground",
                  summaryNights.translated && "notranslate",
                )}
              >
                {summaryNights.text}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mx-auto w-full">
          <Calendar
            locale={resolvedCalendarLocale}
            mode="range"
            required={false}
            resetOnSelect
            excludeDisabled
            selected={calendarSelected}
            onDayClick={(day) => {
              if (
                toggleSelectedRange &&
                selected?.from &&
                selected?.to &&
                !isBefore(day, selected.from) &&
                !isAfter(day, selected.to)
              ) {
                clearSelectionOnNextSelectRef.current = true;
                onRangeChange(undefined);
              }
            }}
            onSelect={(range) => {
              if (clearSelectionOnNextSelectRef.current) {
                clearSelectionOnNextSelectRef.current = false;
                return;
              }
              commitRange(range);
            }}
            numberOfMonths={pagedCalendar ? pagedMonthCount : visibleMonthCount}
            month={pagedCalendar ? displayMonth : undefined}
            onMonthChange={pagedCalendar ? setDisplayMonth : undefined}
            disabled={disabledMatcher}
            defaultMonth={calendarStartMonth}
            showOutsideDays={false}
            formatters={{
              formatCaption: (date) =>
                resolvedCalendarLocale
                  ? format(date, "LLLL yyyy", { locale: resolvedCalendarLocale })
                  : new Intl.DateTimeFormat(calendarLocale, {
                      month: "long",
                      year: "numeric",
                    }).format(date),
              // Single letters on the guest picker: the header is a rhythm cue, not
              // something anyone reads, and dropping "SUN"→"S" lets the cells breathe.
              // The host availability grid has room for the unambiguous short form.
              formatWeekdayName: (date) =>
                resolvedCalendarLocale
                  ? format(date, dayVariant === "default" ? "EEEEE" : "EEE", {
                      locale: resolvedCalendarLocale,
                    })
                  : new Intl.DateTimeFormat(calendarLocale, {
                      weekday: dayVariant === "default" ? "narrow" : "short",
                    }).format(date),
            }}
            modifiers={calendarModifiers}
            modifiersClassNames={dateModifiersClassNames}
            className={cn(
              "mx-auto bg-transparent p-0",
              dayVariant === "availability"
                ? "[--cell-size:3rem] md:[--cell-size:3.25rem]"
                : // At full listing-page width, two months still leave each card near
                  // 4.5rem square. Phones use the fluid single-month row below.
                  dayVariant === "listing"
                  ? "[--cell-size:2.6rem] md:[--cell-size:4.5rem]"
                  : dayVariant === "booking"
                    ? "[--cell-size:2.6rem] md:[--cell-size:3.75rem]"
                  : // A priced cell stacks a number, a price and sometimes the price it
                  // was struck down from, so it needs the room the bare day never did.
                  showsDayPrices
                  ? "[--cell-size:3.1rem] md:[--cell-size:3.4rem]"
                  : pagedCalendar
                    ? "[--cell-size:2.15rem] md:[--cell-size:2.4rem]"
                    : "[--cell-size:2.15rem] md:[--cell-size:2.8rem]",
            )}
            classNames={{
              root: "mx-auto w-full",
              // The paged grid is fluid: each month fills half the panel and each cell a
              // seventh of that, so the same rules give big Airbnb-scale cells in the
              // 64rem search panel and smaller ones in a narrower dialog, without a
              // breakpoint per surface.
              months: cn(
                "relative mx-auto grid w-full grid-cols-1 justify-center gap-y-8 md:gap-y-10",
                pagedCalendar
                  ? pagedMonthCount === 2
                    ? dayVariant === "listing"
                      ? "max-w-none md:grid-cols-2 md:gap-x-12"
                      : dayVariant === "booking"
                        ? "max-w-[54rem] md:grid-cols-2 md:gap-x-10"
                        : "max-w-[58.5rem] md:grid-cols-2 md:gap-x-[4.25rem]"
                    : dayVariant === "listing"
                      ? "max-w-[24rem] md:max-w-none"
                      : dayVariant === "booking"
                        ? "max-w-[26rem]"
                        : "max-w-[24rem]"
                  : dayVariant === "availability"
                    ? "md:grid-cols-2 md:gap-x-6"
                    : dayVariant === "booking"
                      ? "max-w-[24rem]"
                      : "md:w-fit md:grid-cols-2 md:gap-x-8",
              ),
              month: cn(
                "mx-auto flex w-full flex-col items-center",
                pagedCalendar
                  ? dayVariant === "booking"
                    ? "max-w-[26rem] md:max-w-none"
                    : "max-w-[24rem] md:max-w-none"
                  : dayVariant === "availability"
                    ? "max-w-[19rem] md:w-[23rem] md:max-w-none"
                    : dayVariant === "booking"
                      ? "max-w-[24rem]"
                      : "max-w-[19rem] md:w-[20rem] md:max-w-none",
              ),
              nav: pagedCalendar
                ? cn(
                    "absolute left-1/2 top-0 z-10 flex h-10 w-full -translate-x-1/2 items-center justify-between",
                    pagedMonthCount === 2
                      ? dayVariant === "listing"
                        ? "max-w-none"
                        : dayVariant === "booking"
                          ? "max-w-[54rem]"
                          : "max-w-[58.5rem]"
                      : dayVariant === "listing"
                        ? "max-w-none"
                        : dayVariant === "booking"
                          ? "max-w-[26rem]"
                          : "max-w-[24rem]",
                  )
                : "hidden",
              // Bare chevrons with a hover-only halo, and a visibly dead back arrow on
              // the first bookable month rather than one that looks pressable.
              button_previous: pagedCalendar
                ? "flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-disabled:pointer-events-none aria-disabled:opacity-25 [&_svg]:size-4"
                : "hidden",
              button_next: pagedCalendar
                ? "flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-disabled:pointer-events-none aria-disabled:opacity-25 [&_svg]:size-4"
                : "hidden",
              month_caption: cn(
                "mb-4 flex h-10 w-full items-center justify-center font-semibold text-foreground md:mb-5",
                pagedCalendar ? "text-[1.0625rem]" : "text-lg",
              ),
              // `table-fixed` is what keeps two months apart. Under the automatic
              // algorithm a table is never narrower than its widest cell's content
              // times seven, so one long price ("CFPF13,127") swelled the whole grid
              // past its column and the month next to it was drawn underneath. Only
              // these lenses can take it: their cells are `flex-1`, so the row divides
              // whatever width the table is given rather than asking for its own.
              month_grid: cardDayVariant
                ? "mx-auto w-full table-fixed border-collapse"
                : undefined,
              table: "mx-auto w-full border-collapse",
              weekdays: cn("flex w-full", pagedCalendar && "pb-3"),
              weekday:
                "flex-1 text-center text-[0.68rem] font-medium uppercase text-muted-foreground select-none md:text-[0.72rem]",
              // No gap between weeks on the paged grid: each cell is taller than the
              // band inside it, so the inset band supplies the rhythm and a multi-week
              // range still reads as one continuous run rather than stacked dots.
              week: cn("flex w-full", !pagedCalendar && "mt-1"),
              day: cn(
                cardDayVariant
                  ? // Square, and gapped by the cell's own padding so the tiles read as
                    // separate cards rather than one ruled table.
                    "group/day relative h-[3.4rem] min-w-0 flex-1 p-[2px] text-center md:h-auto md:aspect-square"
                  : dayVariant === "availability"
                  ? "group/day relative h-[3.2rem] min-w-0 flex-1 p-0 text-center md:h-[3.6rem] md:w-[3.25rem] md:flex-none"
                  : // Room for three stacked lines — day number, the price, and the
                    // price it was struck down from — at every width, since the cell
                    // height here is what actually sizes the row.
                    showsDayPrices
                    ? cn(
                        "group/day relative h-[3.25rem] min-w-0 flex-1 p-0 text-center md:h-[3.75rem]",
                        !pagedCalendar && "md:w-14 md:flex-none",
                      )
                    : pagedCalendar
                      ? "group/day relative h-[2.6rem] min-w-0 flex-1 p-0 text-center md:h-auto md:aspect-[62/64]"
                      : "group/day relative h-[2.2rem] min-w-0 flex-1 p-0 text-center md:h-11 md:w-11 md:flex-none",
                // A range that wraps onto the next week gets a rounded cap at each row
                // edge, so Saturday closes the band and Sunday reopens it instead of the
                // whole selection reading as one fused blob.
                "[&:first-child]:before:rounded-l-full",
                "[&:last-child]:before:rounded-r-full",
              ),
              range_start:
                cardDayVariant
                  ? "relative"
                  : cn(band, "before:rounded-l-full [&_button]:rounded-full"),
              range_middle:
                cardDayVariant
                  ? "relative"
                  : cn(band, "[&_button]:bg-transparent"),
              range_end:
                cardDayVariant
                  ? "relative"
                  : cn(band, "before:rounded-r-full [&_button]:rounded-full"),
              // The shadcn default fills today with `bg-muted`, which reads as a second
              // selection sitting next to the real one. Today is marked by weight only.
              today: "bg-transparent font-semibold text-foreground",
              outside: "opacity-0 pointer-events-none",
              hidden: "invisible",
            }}
            components={{
              DayButton: (props) => (
                <MarketplaceRangeDayButton
                  {...props}
                  locale={resolvedCalendarLocale}
                />
              ),
            }}
          />
          {priceNote ? (
            <p
              className={cn(
                "mt-3 text-center text-xs text-muted-foreground md:mt-4",
                priceNote.translated && "notranslate",
              )}
            >
              {priceNote.text}
            </p>
          ) : null}
        </div>
      </div>
    </DragContext.Provider>
  );
}

export function MarketplaceStayDatePicker({
  layout,
  checkIn,
  checkOut,
  guestCounts = EMPTY_GUEST_COUNTS,
  dateFlexibility = 0,
  open: controlledOpen,
  onOpenChange,
  onStepChange,
  initialSegment = "checkin",
  initialStep = "dates",
  showBackToPlace = false,
  showDateFlexibility = true,
  showGuestStep = true,
  finalActionLabel,
  finalActionDisabled = false,
  showFinalActionIcon = true,
  nextActionLabel,
  guestStepTitle,
  maxOccupancy,
  petsAllowed = true,
  onRangeStringsChange,
  onGuestCountsChange = () => undefined,
  onDateFlexibilityChange = () => undefined,
  onBackToPlace,
  onFinalAction,
  onSearchRequest = () => undefined,
  dateDialogTitle,
  dateDialogDescription,
  hideDateSegmentCards = false,
  disabledDateRanges = [],
  dayMeta,
  priceNote,
  dayVariant = "default",
  dateModifiers,
  dateModifiersClassNames,
  minimumStayNights,
  maximumStayNights,
  minimumStayMessage,
  renderDateFooter,
  pagedCalendarOnDesktop = false,
  hidePillDivider = false,
  desktopContentRef,
  desktopContentStyle,
  useSharedDesktopShell = false,
  showPillGuestAction = false,
  showGuestStepChrome = false,
  reviewStepTitle,
  renderReviewStep,
  reviewStepEnabled = true,
  guestsAnswered = false,
  searchPresentation = false,
  dialogContentId,
  className,
}: {
  layout: Layout;
  checkIn: string;
  checkOut: string;
  guestCounts?: GuestCounts;
  dateFlexibility?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onStepChange?: (step: Step) => void;
  initialSegment?: "checkin" | "checkout";
  initialStep?: Step;
  showBackToPlace?: boolean;
  showDateFlexibility?: boolean;
  showGuestStep?: boolean;
  finalActionLabel?: Resolved;
  /** Guards the final action against a selection the caller considers incomplete. */
  finalActionDisabled?: boolean;
  /** The search icon belongs to "Search"; a booking flow ends in "Request to book". */
  showFinalActionIcon?: boolean;
  /** Names the guest step on the dates footer ("Who's coming" beats a bare "Next"). */
  nextActionLabel?: Resolved;
  guestStepTitle?: Resolved;
  /** Adults and children consume listing capacity; infants and pets do not. */
  maxOccupancy?: number;
  /** Whether the listing being booked takes pets. See `GuestCountsStep`. */
  petsAllowed?: boolean;
  onRangeStringsChange: (next: { checkIn: string; checkOut: string }) => void;
  onGuestCountsChange?: (next: GuestCounts) => void;
  onDateFlexibilityChange?: (next: number) => void;
  onBackToPlace?: () => void;
  onFinalAction?: () => void;
  onSearchRequest?: () => void;
  dateDialogTitle?: Resolved;
  dateDialogDescription?: Resolved;
  hideDateSegmentCards?: boolean;
  disabledDateRanges?: { from: Date; to: Date }[];
  dayMeta?: (date: Date) => MarketplaceDayMeta | undefined;
  /** Names the currency the day prices are in, under the grid. */
  priceNote?: Resolved;
  dayVariant?: "default" | "availability" | "listing" | "booking";
  dateModifiers?: React.ComponentProps<typeof Calendar>["modifiers"];
  dateModifiersClassNames?: React.ComponentProps<
    typeof Calendar
  >["modifiersClassNames"];
  minimumStayNights?: number;
  /** The host's stay-length cap, passed straight through to the calendar. */
  maximumStayNights?: number;
  minimumStayMessage?: Resolved;
  renderDateFooter?: (controls: {
    canGoNext: boolean;
    closePicker: () => void;
    resetDates: () => void;
    summaryText: Resolved;
  }) => React.ReactNode;
  pagedCalendarOnDesktop?: boolean;
  hidePillDivider?: boolean;
  desktopContentRef?: React.Ref<HTMLDivElement>;
  desktopContentStyle?: React.CSSProperties;
  useSharedDesktopShell?: boolean;
  showPillGuestAction?: boolean;
  /**
   * Gives the streamlined guest step a title, a close control and a way back to the
   * dates.
   *
   * Off for the search pill, whose guest panel hangs under the pill it belongs to and
   * reads as part of it. A booking flow opens the same step as a centred dialog with
   * nothing else on screen, and without this it is a column of counters that names
   * neither what it is asking nor how to get out of it.
   */
  showGuestStepChrome?: boolean;
  /** Names the review step in the header and for screen readers. */
  reviewStepTitle?: Resolved;
  /**
   * The step after the guests, drawn by the caller.
   *
   * Supplying it turns the guest step's primary button into a way forward rather than a
   * way out: the picker advances to this step instead of firing `onFinalAction` and
   * closing. Return a scrollable body and a footer — the dialog is a flex column and
   * this renders straight into it — and use `goToStep` to send the guest back to the
   * dates or the guests they are reviewing.
   */
  renderReviewStep?: (controls: {
    goToStep: (step: "dates" | "guests") => void;
    close: () => void;
  }) => React.ReactNode;
  /** When false, the guest action returns to dates instead of entering review. */
  reviewStepEnabled?: boolean;
  /** Whether the party is already settled — from an earlier step, or from the search
   *  the guest arrived on. The calendar skips over the counts when it is. */
  guestsAnswered?: boolean;
  /** Keep the caller's trigger while using the streamlined search calendar and guest panels. */
  searchPresentation?: boolean;
  dialogContentId?: string;
  className?: string;
}) {
  const labels = useSearchLabels();
  const resolvedDialogTitle = dateDialogTitle ?? labels.chooseDates;
  const resolvedDialogDescription =
    dateDialogDescription ?? labels.chooseDatesDescription;
  const resolvedFinalActionLabel =
    finalActionLabel ?? (showGuestStep ? labels.search : labels.done);
  // The button that leaves the dates step should name where it goes; a bare "Next"
  // gives no reason to press it.
  const resolvedNextActionLabel = nextActionLabel ?? labels.whosComing;
  const resolvedGuestStepTitle = guestStepTitle ?? labels.whosComing;
  const resolvedReviewStepTitle = reviewStepTitle ?? resolvedGuestStepTitle;
  const isPillLayout = layout === "pill";
  const [isDesktopViewport, setIsDesktopViewport] = React.useState(false);
  const useSearchPresentation =
    isPillLayout || (searchPresentation && isDesktopViewport);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>(initialStep);
  /** What the dialog calls itself, wherever the guest is in it. */
  const stepTitle =
    step === "dates"
      ? resolvedDialogTitle
      : step === "guests"
        ? resolvedGuestStepTitle
        : resolvedReviewStepTitle;
  const [activeSegment, setActiveSegment] = React.useState<
    "checkin" | "checkout"
  >("checkin");
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);
  const previousOpenRef = React.useRef(false);
  const openingFromTriggerRef = React.useRef(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktopViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const closePicker = React.useCallback(() => {
    setOpen(false);
    setStep("dates");
    setActiveSegment("checkin");
  }, [setOpen]);
  const changeStep = React.useCallback(
    (nextStep: Step) => {
      setStep(nextStep);
      onStepChange?.(nextStep);
    },
    [onStepChange],
  );

  /**
   * What the guest step's primary button does.
   *
   * With a review step it is a way forward and the picker stays open; without one it is
   * the last press in here, which is search's case — it fires the final action and
   * closes. Both footers below share it so the two presentations cannot drift.
   */
  /**
   * What the calendar's forward button does, and what it should say it does.
   *
   * Both presentations share it, so the desktop pill and the dialog footer cannot send
   * the same press to two different places.
   */
  const datesStepGoesTo = datesStepDestination(
    showGuestStep,
    guestsAnswered,
    Boolean(renderReviewStep),
    reviewStepEnabled,
  );
  const resolvedDatesActionLabel =
    datesStepGoesTo === "guests"
      ? resolvedNextActionLabel
      : resolvedFinalActionLabel;
  const leaveDatesStep = React.useCallback(() => {
    if (datesStepGoesTo) {
      changeStep(datesStepGoesTo);
      return;
    }
    if (onFinalAction) onFinalAction();
    else onSearchRequest();
    closePicker();
  }, [
    changeStep,
    closePicker,
    datesStepGoesTo,
    onFinalAction,
    onSearchRequest,
  ]);

  const leaveGuestStep = React.useCallback(() => {
    const destination = guestStepDestination(
      Boolean(renderReviewStep),
      reviewStepEnabled,
    );
    if (destination) {
      changeStep(destination);
      return;
    }
    if (onFinalAction) onFinalAction();
    else onSearchRequest();
    closePicker();
  }, [
    changeStep,
    closePicker,
    onFinalAction,
    onSearchRequest,
    renderReviewStep,
    reviewStepEnabled,
  ]);

  React.useEffect(() => {
    if (!open || (isPillLayout && window.innerWidth >= 768)) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPillLayout, open]);

  React.useEffect(() => {
    if (!open) return;
    bodyScrollRef.current?.scrollTo({ top: 0 });
  }, [open, step]);

  React.useEffect(() => {
    if (open && !previousOpenRef.current) {
      setStep(initialStep);
      if (openingFromTriggerRef.current) {
        openingFromTriggerRef.current = false;
      } else {
        setActiveSegment(initialSegment);
      }
    }
    previousOpenRef.current = open;
  }, [open, initialSegment, initialStep]);

  const selectedRange = React.useMemo<DateRange | undefined>(() => {
    const from = parseLocalYmd(checkIn);
    const to = parseLocalYmd(checkOut);
    if (!from && !to) return undefined;
    if (from && to) return { from, to };
    if (from) return { from, to: undefined };
    return undefined;
  }, [checkIn, checkOut]);

  const commitRange = React.useCallback(
    (range: DateRange | undefined) => {
      if (!range?.from) {
        onRangeStringsChange({ checkIn: "", checkOut: "" });
        return;
      }
      if (!range.to) {
        onRangeStringsChange({ checkIn: toYmd(range.from), checkOut: "" });
        return;
      }
      // Completing the range never closes the sheet: the footer button is what
      // moves the flow on, and the flexibility chips below are only reachable
      // while the picker stays open.
      onRangeStringsChange({
        checkIn: toYmd(range.from),
        checkOut: toYmd(range.to),
      });
    },
    [onRangeStringsChange],
  );

  const checkInLabel: Resolved =
    selectedRange?.from && checkIn
      ? {
          text: formatMonthDay(selectedRange.from, labels.locale),
          translated: false,
        }
      : labels.addDates;
  const checkOutLabel: Resolved =
    selectedRange?.to && checkOut
      ? {
          text: formatMonthDay(selectedRange.to, labels.locale),
          translated: false,
        }
      : labels.addDates;
  const mobileDatesLabel: Resolved =
    checkIn && checkOut && selectedRange?.from && selectedRange?.to
      ? {
          text: `${formatMonthDay(selectedRange.from, labels.locale)} - ${formatMonthDay(selectedRange.to, labels.locale)}`,
          translated: false,
        }
      : labels.addDates;
  const summaryText: Resolved =
    selectedRange?.from && selectedRange?.to
      ? {
          text: `${formatMonthDay(selectedRange.from, labels.locale)} - ${formatMonthDay(selectedRange.to, labels.locale)}`,
          translated: false,
        }
      : selectedRange?.from
        ? {
            text: formatMonthDay(selectedRange.from, labels.locale),
            translated: false,
          }
        : labels.addDates;
  // False while the trigger is still showing the "Add dates" prompt, so the pill can
  // grey it like the Where / Who placeholders instead of styling it as a real value.
  const hasDateSelection = Boolean(selectedRange?.from);
  // The narrow single-button variant only ever prints a full range, so it stays in the
  // placeholder state until both ends are picked.
  const hasFullDateRange = Boolean(
    checkIn && checkOut && selectedRange?.from && selectedRange?.to,
  );
  // Mirrors the calendar's own restriction, so the rule is on screen for exactly as
  // long as the greyed-out window is — hovering a day was never an option on touch.
  const minimumStayHint = React.useMemo<Resolved | null>(() => {
    if (!minimumStayMessage || !minimumStayNights || minimumStayNights < 2) {
      return null;
    }
    if (!selectedRange?.from || selectedRange.to) return null;

    const earliest = interpolate(labels.minimumStayEarliest, {
      date: formatMonthDay(
        addDays(selectedRange.from, minimumStayNights),
        labels.locale,
      ),
    });
    return {
      text: `${minimumStayMessage.text}. ${earliest.text}`,
      translated: minimumStayMessage.translated && earliest.translated,
    };
  }, [labels, minimumStayMessage, minimumStayNights, selectedRange]);

  const [minimumStayNudgeKey, setMinimumStayNudgeKey] = React.useState(0);
  const [minimumStayNudging, setMinimumStayNudging] = React.useState(false);
  // A dead-end check-in has no pending selection to hang a persistent banner off, so
  // its reason is flashed in the same slot and then withdrawn.
  const [flashedBlock, setFlashedBlock] = React.useState<Resolved | null>(null);
  const minimumStayNudgeTimerRef = React.useRef<number | null>(null);
  const flashedBlockTimerRef = React.useRef<number | null>(null);
  const nudgeMinimumStayHint = React.useCallback((block: DayBlock) => {
    setMinimumStayNudgeKey((key) => key + 1);
    setMinimumStayNudging(true);
    navigator.vibrate?.(10);
    if (minimumStayNudgeTimerRef.current !== null) {
      window.clearTimeout(minimumStayNudgeTimerRef.current);
    }
    minimumStayNudgeTimerRef.current = window.setTimeout(
      () => setMinimumStayNudging(false),
      1000,
    );

    if (flashedBlockTimerRef.current !== null) {
      window.clearTimeout(flashedBlockTimerRef.current);
      flashedBlockTimerRef.current = null;
    }
    if (block.kind !== "too-short-gap") {
      setFlashedBlock(null);
      return;
    }
    setFlashedBlock(block.message);
    flashedBlockTimerRef.current = window.setTimeout(
      () => setFlashedBlock(null),
      5000,
    );
  }, []);
  React.useEffect(
    () => () => {
      if (minimumStayNudgeTimerRef.current !== null) {
        window.clearTimeout(minimumStayNudgeTimerRef.current);
      }
      if (flashedBlockTimerRef.current !== null) {
        window.clearTimeout(flashedBlockTimerRef.current);
      }
    },
    [],
  );

  const datesBanner = minimumStayHint ?? flashedBlock;

  const nightCount = getNightCount(selectedRange);
  const canGoNext =
    dayVariant === "availability"
      ? Boolean(selectedRange?.from)
      : Boolean(selectedRange?.from && selectedRange?.to);

  const segmentActive = (seg: "checkin" | "checkout") =>
    open && step === "dates" && activeSegment === seg;

  const openSegment = (seg: "checkin" | "checkout") => {
    openingFromTriggerRef.current = true;
    changeStep("dates");
    setActiveSegment(seg);
    setOpen(true);
  };

  const resetDates = React.useCallback(() => {
    onRangeStringsChange({ checkIn: "", checkOut: "" });
    onDateFlexibilityChange(0);
    setActiveSegment("checkin");
  }, [onDateFlexibilityChange, onRangeStringsChange]);

  const resetGuests = React.useCallback(() => {
    onGuestCountsChange({ adults: 0, children: 0, infants: 0, pets: 0 });
  }, [onGuestCountsChange]);

  const pillSeg = (seg: "checkin" | "checkout") =>
    cn(
      "flex min-w-0 flex-1 items-center rounded-full px-6 py-[15px] text-left outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      segmentActive(seg) ? "bg-white shadow-[0_3px_12px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.08)]" : "hover:bg-[#EBEBEB] group-data-[panel-open=true]/pill:hover:bg-[#DDDDDD]",
    );

  const heroSeg = (seg: "checkin" | "checkout") =>
    cn(
      "flex flex-1 cursor-pointer gap-2 text-left outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      layout === "compact"
        ? "rounded-[1.6rem] border px-4 py-4 md:rounded-none md:border-0 md:px-4 md:py-2.5"
        : "rounded-xl px-4 py-3 md:px-5 md:py-4",
      segmentActive(seg)
        ? "border-border/70 bg-background shadow-[0_10px_24px_rgba(15,23,42,0.08)] md:rounded-2xl"
        : layout === "compact"
          ? "border-transparent bg-transparent hover:border-border/60 hover:bg-muted/25"
          : "hover:bg-muted/25",
    );

  /**
   * Empty, the two date segments are one prompt printed under two headings, and there
   * is nothing yet to divide between them. The card collapses them into a single row
   * that says what pressing it does; they split apart again the moment a date exists.
   * Only the card: the search bar's segments are what a guest scans that pill by.
   */
  const collapseEmptyDates =
    layout === "compact" && !checkIn && !checkOut && !hasDateSelection;

  const triggers = (
    <>
      {layout === "field" ? (
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border border-input bg-background px-3.5 py-2.5 text-left transition-colors outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => openSegment("checkin")}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={dialogContentId}
        >
          <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              "truncate text-sm font-medium",
              !(checkIn && checkOut) && "text-muted-foreground",
              ((checkIn && checkOut) || mobileDatesLabel.translated) &&
                "notranslate",
            )}
            translate={
              (checkIn && checkOut) || mobileDatesLabel.translated ? "no" : undefined
            }
            suppressHydrationWarning
          >
            {mobileDatesLabel.text}
          </span>
        </button>
      ) : layout === "pill" ? (
        <div className="flex flex-1 min-w-0 items-stretch">
          <button
            type="button"
            className={cn(pillSeg("checkin"), "relative sm:hidden")}
            onClick={() => openSegment("checkin")}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls={dialogContentId}
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-xs font-medium leading-4 text-[#222222]",
                  labels.when.translated && "notranslate",
                )}
              >
                {labels.when.text}
              </span>
              <span
                className={cn(
                  "block truncate text-sm font-normal leading-[18px]",
                  hasFullDateRange ? "text-[#222222]" : "text-[#6C6C6C]",
                  (hasFullDateRange || mobileDatesLabel.translated) && "notranslate",
                )}
                translate={
                  hasFullDateRange || mobileDatesLabel.translated ? "no" : undefined
                }
                suppressHydrationWarning
              >
                {mobileDatesLabel.text}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={cn(
              pillSeg("checkin"),
              "relative hidden sm:flex after:absolute after:-right-[3px] after:top-1/2 after:h-8 after:w-px after:-translate-y-1/2 after:bg-[#DDDDDD] after:transition-opacity after:duration-150",
              segmentActive("checkin") && "after:opacity-0",
              segmentActive("checkout") && "after:opacity-0",
              hidePillDivider && "after:opacity-0",
            )}
            onClick={() => openSegment("checkin")}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls={dialogContentId}
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-xs font-medium leading-4 text-[#222222]",
                  labels.when.translated && "notranslate",
                )}
              >
                {labels.when.text}
              </span>
              <span
                className={cn(
                  "block truncate text-sm font-normal leading-[18px]",
                  hasDateSelection ? "text-[#222222]" : "text-[#6C6C6C]",
                  (hasDateSelection || summaryText.translated) && "notranslate",
                )}
                translate={
                  hasDateSelection || summaryText.translated ? "no" : undefined
                }
                suppressHydrationWarning
              >
                {summaryText.text}
              </span>
            </span>
          </button>
        </div>
      ) : collapseEmptyDates ? (
        <button
          type="button"
          className={cn(heroSeg("checkin"), "w-full")}
          onClick={() => openSegment("checkin")}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={dialogContentId}
        >
          <CalendarRange className="mt-0.5 hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "block text-xs font-semibold tracking-wide",
                labels.when.translated && "notranslate",
              )}
            >
              {labels.when.text}
            </span>
            <span
              className={cn(
                "text-sm font-medium text-muted-foreground md:text-base",
                labels.chooseDates.translated && "notranslate",
              )}
            >
              {labels.chooseDates.text}
            </span>
          </div>
        </button>
      ) : (
        <div
          className={cn(
            "flex flex-1 min-w-0 divide-x divide-border/80",
            layout === "compact" && "flex-row",
          )}
        >
          <button
            type="button"
            className={heroSeg("checkin")}
            onClick={() => openSegment("checkin")}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls={dialogContentId}
          >
            <CalendarRange className="mt-0.5 hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-xs font-semibold tracking-wide",
                  labels.checkIn.translated && "notranslate",
                )}
              >
                {labels.checkIn.text}
              </span>
              <span
                className={cn(
                  "text-sm font-medium md:text-base",
                  !checkIn && "text-muted-foreground",
                  (checkIn || checkInLabel.translated) && "notranslate",
                )}
                translate={checkIn || checkInLabel.translated ? "no" : undefined}
                suppressHydrationWarning
              >
                {checkInLabel.text}
              </span>
            </div>
          </button>
          <button
            type="button"
            className={heroSeg("checkout")}
            onClick={() => openSegment("checkout")}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls={dialogContentId}
          >
            <div className="min-w-0 flex-1 sm:pl-0">
              <span
                className={cn(
                  "block text-xs font-semibold tracking-wide",
                  labels.checkOut.translated && "notranslate",
                )}
              >
                {labels.checkOut.text}
              </span>
              <span
                className={cn(
                  "text-sm font-medium md:text-base",
                  !checkOut && "text-muted-foreground",
                  (checkOut || checkOutLabel.translated) && "notranslate",
                )}
                translate={checkOut || checkOutLabel.translated ? "no" : undefined}
                suppressHydrationWarning
              >
                {checkOutLabel.text}
              </span>
            </div>
          </button>
        </div>
      )}
    </>
  );

  return (
    <DialogPrimitive.Root
      open={open}
      modal={!isPillLayout}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setOpen(true);
        else closePicker();
      }}
    >
      {/*
       * This control replaces several text nodes as the selected range changes.
       * Google Translate also replaces text nodes in-place, which can leave React
       * trying to remove nodes that are no longer its children. The app already
       * resolves supported-language copy before rendering, so keep the interactive
       * picker tree under React's exclusive ownership.
       */}
      <div className={cn("min-w-0", className)}>
        {triggers}
      </div>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50",
            isPillLayout
              ? "bg-transparent"
              : "bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
          )}
        />
        <DialogPrimitive.Content
          id={dialogContentId}
          ref={desktopContentRef}
          style={desktopContentStyle}
          className={cn(
            useSharedDesktopShell
              ? "fixed z-[52] flex h-auto flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-background text-popover-foreground shadow-[0_10px_32px_rgba(0,0,0,0.16)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=open]:duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-2 data-[state=closed]:duration-100"
              : "fixed z-50 flex flex-col overflow-hidden border border-border/60 bg-background text-popover-foreground shadow-[0_10px_32px_rgba(0,0,0,0.16)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-2",
            !useSharedDesktopShell &&
              "left-3 right-3 top-4 bottom-4 h-auto max-h-[calc(100dvh-2rem)] rounded-[2rem]",
            !useSharedDesktopShell && isPillLayout
              ? dayVariant === "availability"
                ? "md:left-1/2 md:right-auto md:top-[5.75rem] md:bottom-auto md:h-auto md:max-h-[min(44rem,calc(100dvh-7rem))] md:w-[58rem] md:max-w-[calc(100vw-4rem)] md:-translate-x-1/2 md:rounded-[2rem]"
                : "md:left-1/2 md:right-auto md:top-[5.75rem] md:bottom-auto md:h-auto md:max-h-[min(35rem,calc(100dvh-7rem))] md:w-[45rem] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:rounded-[1.75rem]"
              : !useSharedDesktopShell && dayVariant === "availability"
                ? "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[50rem] md:max-h-[calc(100dvh-5rem)] md:w-[58rem] md:max-w-[calc(100vw-4rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]"
                : !useSharedDesktopShell && useSearchPresentation && step === "review"
                  ? // Wider and taller than the guest counters: this one carries the
                    // price, the rules and the button that sends the request.
                    "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-auto md:max-h-[calc(100dvh-4rem)] md:w-[30rem] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[1.75rem]"
                : !useSharedDesktopShell && useSearchPresentation && step === "guests"
                  ? "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-auto md:max-h-[calc(100dvh-5rem)] md:w-[25rem] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[1.75rem]"
                  : !useSharedDesktopShell && searchPresentation && step === "dates"
                    ? "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-auto md:max-h-[min(42rem,calc(100dvh-4rem))] md:w-[58rem] md:max-w-[calc(100vw-4rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]"
                  : !useSharedDesktopShell && pagedCalendarOnDesktop
                    ? "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[46rem] md:max-h-[calc(100dvh-2rem)] md:w-[58rem] md:max-w-[calc(100vw-4rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]"
                    : !useSharedDesktopShell &&
                      "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[50rem] md:max-h-[calc(100dvh-5rem)] md:w-[44rem] md:max-w-[calc(100vw-6rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]",
          )}
          onPointerDownOutside={(event) => {
            const target = event.target;
            if (
              isPillLayout &&
              target instanceof Element &&
              target.closest("[data-desktop-search-pill]")
            ) {
              event.preventDefault();
            }
          }}
          onFocusOutside={(event) => {
            const target = event.target;
            if (
              isPillLayout &&
              target instanceof Element &&
              target.closest("[data-desktop-search-pill]")
            ) {
              event.preventDefault();
            }
          }}
        >
          <div className="sr-only">
            <DialogPrimitive.Title
              className={stepTitle.translated ? "notranslate" : undefined}
            >
              {stepTitle.text}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={
                (step === "dates"
                  ? resolvedDialogDescription
                  : labels.chooseGuestsDescription
                ).translated
                  ? "notranslate"
                  : undefined
              }
            >
              {step === "dates"
                ? resolvedDialogDescription.text
                : labels.chooseGuestsDescription.text}
            </DialogPrimitive.Description>
          </div>

          {!useSearchPresentation ? (
            <div className="shrink-0 border-b border-border/70 bg-background px-4 pt-4 pb-4 md:px-6 md:pt-5">
              <div
                className={cn(
                  "flex items-start justify-between gap-4",
                  step !== "review" && "mb-4",
                )}
              >
                <p
                  className={cn(
                    "text-lg font-semibold text-foreground md:text-2xl",
                    stepTitle.translated && "notranslate",
                  )}
                >
                  {stepTitle.text}
                </p>
                <button
                  type="button"
                  onClick={closePicker}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={labels.closePicker.text}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {step === "review" ? null : step === "dates" ? (
                hideDateSegmentCards ? null : (
                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveSegment("checkin")}
                      className={cn(
                        "min-w-0 rounded-xl border px-2 py-2.5 text-left transition-colors md:rounded-2xl md:px-4 md:py-3",
                        segmentActive("checkin")
                          ? "border-foreground bg-muted/40"
                          : "border-border bg-background hover:bg-muted/30",
                      )}
                    >
                      <span
                        className={cn(
                          "block truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground md:text-[11px] md:tracking-[0.14em]",
                          labels.checkIn.translated && "notranslate",
                        )}
                      >
                        {labels.checkIn.text}
                      </span>
                      <span
                        className={cn(
                          "mt-1 block truncate text-[0.9rem] font-semibold leading-tight text-foreground md:text-base",
                          (checkIn || checkInLabel.translated) && "notranslate",
                        )}
                        translate={
                          checkIn || checkInLabel.translated ? "no" : undefined
                        }
                        suppressHydrationWarning
                      >
                        {checkInLabel.text}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSegment("checkout")}
                      className={cn(
                        "min-w-0 rounded-xl border px-2 py-2.5 text-left transition-colors md:rounded-2xl md:px-4 md:py-3",
                        segmentActive("checkout")
                          ? "border-foreground bg-muted/40"
                          : "border-border bg-background hover:bg-muted/30",
                      )}
                    >
                      <span
                        className={cn(
                          "block truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground md:text-[11px] md:tracking-[0.14em]",
                          labels.checkOut.translated && "notranslate",
                        )}
                      >
                        {labels.checkOut.text}
                      </span>
                      <span
                        className={cn(
                          "mt-1 block truncate text-[0.9rem] font-semibold leading-tight text-foreground md:text-base",
                          (checkOut || checkOutLabel.translated) && "notranslate",
                        )}
                        translate={
                          checkOut || checkOutLabel.translated ? "no" : undefined
                        }
                        suppressHydrationWarning
                      >
                        {checkOutLabel.text}
                      </span>
                    </button>
                  </div>
                )
              ) : (
                <div className="rounded-[1.5rem] border border-border bg-muted/20 px-4 py-4 md:px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground",
                          labels.when.translated && "notranslate",
                        )}
                      >
                        {labels.when.text}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-base font-semibold text-foreground md:text-lg",
                          (hasDateSelection || summaryText.translated) && "notranslate",
                        )}
                        translate={
                          hasDateSelection || summaryText.translated ? "no" : undefined
                        }
                        suppressHydrationWarning
                      >
                        {summaryText.text}
                      </p>
                      {nightCount > 0
                        ? (() => {
                            const nightLabel = pluralText(
                              labels.night,
                              nightCount,
                              labels.locale,
                            );
                            return (
                              <p
                                className={cn(
                                  "mt-1 text-sm text-muted-foreground",
                                  nightLabel.translated && "notranslate",
                                )}
                              >
                                {nightLabel.text}
                              </p>
                            );
                          })()
                        : null}
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "shrink-0 text-sm font-semibold text-foreground",
                        labels.edit.translated && "notranslate",
                      )}
                      onClick={() => changeStep("dates")}
                    >
                      {labels.edit.text}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* The streamlined presentation drops the header, which suits a panel hanging
              under the search pill and leaves a centred booking dialog unnamed and with
              no way out. The dates step keeps its own chrome either way. */}
          {useSearchPresentation && showGuestStepChrome && step !== "dates" ? (
            <div className="flex shrink-0 items-start justify-between gap-4 px-4 pt-5 md:px-6 md:pt-6">
              <p
                className={cn(
                  "text-lg font-semibold text-foreground",
                  stepTitle.translated && "notranslate",
                )}
              >
                {stepTitle.text}
              </p>
              <button
                type="button"
                onClick={closePicker}
                className="-mr-1 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={labels.closePicker.text}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {step === "dates" ? (
            <div
              key="dates"
              className={cn(
                "relative flex min-h-0 flex-1 flex-col",
                useSharedDesktopShell
                  ? "desktop-search-panel-content"
                  : "",
              )}
            >
              <div className="relative flex min-h-0 flex-1 flex-col">
                {/* Keep guidance out of document flow. Inserting a banner above the
                    calendar after check-in moves every date under the guest's finger. */}
                {datesBanner ? (
                  <div
                    key={minimumStayNudgeKey}
                    aria-live="polite"
                    className={cn(
                      "pointer-events-none absolute inset-x-3 bottom-3 z-30 flex items-start gap-2 rounded-2xl border border-border/70 px-3.5 py-3 text-[0.8rem] leading-snug shadow-[0_10px_30px_rgba(15,23,42,0.18)] backdrop-blur-md transition-colors duration-200 animate-in fade-in-0 slide-in-from-bottom-3 md:inset-x-auto md:left-1/2 md:w-[min(30rem,calc(100%-3rem))] md:-translate-x-1/2 md:px-4",
                      minimumStayNudging
                        ? "bg-foreground font-medium text-background"
                        : "bg-background/95 text-foreground",
                    )}
                  >
                    <Info className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                    <span
                      className={
                        datesBanner.translated ? "notranslate" : undefined
                      }
                    >
                      {datesBanner.text}
                    </span>
                  </div>
                ) : null}

                <DateRangeCalendarStep
                  active={open && step === "dates"}
                  selected={selectedRange}
                  onRangeChange={commitRange}
                  onFromOnlySelected={() => setActiveSegment("checkout")}
                  disabledDateRanges={disabledDateRanges}
                  dayMeta={dayMeta}
                  priceNote={priceNote}
                  dayVariant={dayVariant}
                  dateModifiers={dateModifiers}
                  dateModifiersClassNames={dateModifiersClassNames}
                  minimumStayNights={minimumStayNights}
                  maximumStayNights={maximumStayNights}
                  minimumStayMessage={minimumStayMessage}
                  onMinimumStayBlocked={nudgeMinimumStayHint}
                  fitViewport={useSearchPresentation}
                  pagedOnDesktop={pagedCalendarOnDesktop}
                  showEndpointHeader={useSearchPresentation}
                />
              </div>

              <div
                className={cn(
                  "shrink-0 bg-background",
                  // The desktop panel reads as one surface, so the flexibility pills sit
                  // on the same field as the grid instead of behind a rule.
                  !useSearchPresentation && "border-t border-border",
                )}
              >
                {showDateFlexibility || (useSearchPresentation && showGuestStep) ? (
                  // One footer line on the desktop panel: flexibility on the left (it
                  // scrolls on its own when the pills outgrow the space) and the step
                  // action on the right, so the panel doesn't grow a second bar.
                  <div
                    className={cn(
                      "items-center gap-4",
                      useSearchPresentation
                        ? "grid grid-cols-[1fr_auto_1fr] px-4 md:px-10 md:pb-7 md:pt-4"
                        : "flex px-4 md:px-6",
                    )}
                  >
                    {useSearchPresentation ? <div aria-hidden="true" /> : null}

                    {showDateFlexibility ? (
                      <div
                        className={cn(
                          "min-w-0 py-2",
                          !useSearchPresentation && "flex-1",
                        )}
                      >
                        <DateFlexibilityRow
                          value={dateFlexibility}
                          onChange={onDateFlexibilityChange}
                        />
                      </div>
                    ) : (
                      <div className="flex-1" />
                    )}

                    {useSearchPresentation && showGuestStep ? (
                      // Completing a range used to fling the panel straight into the
                      // guest step. Advancing is now the guest's call, and the button
                      // names where it goes.
                      <Button
                        type="button"
                        className={cn(
                          PILL_STEP_ACTION,
                          "hidden justify-self-end md:inline-flex",
                          resolvedDatesActionLabel.translated && "notranslate",
                        )}
                        disabled={!canGoNext}
                        onClick={leaveDatesStep}
                      >
                        {resolvedDatesActionLabel.text}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {!useSearchPresentation ? (
                  <div
                    className={cn(
                      "bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-4",
                      showDateFlexibility && "border-t border-border",
                    )}
                  >
                    {renderDateFooter ? (
                      renderDateFooter({
                        canGoNext,
                        closePicker,
                        resetDates,
                        summaryText,
                      })
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "min-w-0 shrink-0 rounded-full sm:min-w-[7rem]",
                            labels.reset.translated && "notranslate",
                          )}
                          onClick={resetDates}
                        >
                          {labels.reset.text}
                        </Button>
                        <div className="flex min-w-0 items-center justify-end gap-3">
                          {showBackToPlace ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={cn(
                                "min-w-[7rem] rounded-full",
                                labels.back.translated && "notranslate",
                              )}
                              onClick={onBackToPlace}
                            >
                              {labels.back.text}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            className={cn(
                              "min-w-[7rem] rounded-full",
                              resolvedDatesActionLabel.translated && "notranslate",
                            )}
                            disabled={!canGoNext}
                            onClick={leaveDatesStep}
                          >
                            {resolvedDatesActionLabel.text}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : step === "guests" ? (
            <div
              key="guests"
              className={cn(
                useSharedDesktopShell
                  ? "desktop-search-panel-content flex min-h-0 flex-1 flex-col"
                  : "contents",
              )}
            >
              <div
                ref={bodyScrollRef}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-6 md:py-6"
              >
                <GuestCountsStep
                  guestCounts={guestCounts}
                  onGuestCountsChange={onGuestCountsChange}
                  maxOccupancy={maxOccupancy}
                  petsAllowed={petsAllowed}
                />
              </div>

              {useSearchPresentation && showPillGuestAction ? (
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-3 bg-background px-4 md:px-10 md:pb-7 md:pt-4",
                    // Lined up with the counters above rather than centred under them,
                    // now that there are two buttons to line up.
                    showGuestStepChrome
                      ? "justify-between md:px-6"
                      : "justify-center",
                  )}
                >
                  {/* Without this the dates are unreachable from here: the guest step
                      of a booking flow is a dialog of its own, opened straight from the
                      card's guests row as often as from the calendar behind it. */}
                  {showGuestStepChrome ? (
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "rounded-full",
                        labels.back.translated && "notranslate",
                      )}
                      onClick={() => changeStep("dates")}
                    >
                      {labels.back.text}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    className={cn(
                      PILL_STEP_ACTION,
                      resolvedFinalActionLabel.translated && "notranslate",
                    )}
                    disabled={finalActionDisabled}
                    onClick={leaveGuestStep}
                  >
                    {showFinalActionIcon ? (
                      <Search className="mr-2 h-4 w-4" />
                    ) : null}
                    {resolvedFinalActionLabel.text}
                  </Button>
                </div>
              ) : null}

              {!useSearchPresentation ? (
                <div className="shrink-0 border-t border-border bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "self-start rounded-full sm:min-w-[7rem]",
                        labels.reset.translated && "notranslate",
                      )}
                      onClick={resetGuests}
                    >
                      {labels.reset.text}
                    </Button>
                    <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "min-w-[7rem] rounded-full",
                          labels.back.translated && "notranslate",
                        )}
                        onClick={() => changeStep("dates")}
                      >
                        {labels.back.text}
                      </Button>
                      <Button
                        type="button"
                        className={cn(
                          "min-w-[7rem] rounded-full",
                          resolvedFinalActionLabel.translated && "notranslate",
                        )}
                        disabled={finalActionDisabled}
                        onClick={leaveGuestStep}
                      >
                        {showFinalActionIcon ? (
                          <Search className="mr-2 h-4 w-4" />
                        ) : null}
                        {resolvedFinalActionLabel.text}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            // Wholly the caller's: a body and a footer, rendered straight into the
            // dialog's column. The picker supplies the frame, the header and the way
            // back, and knows nothing about what is being reviewed.
            <div
              key="review"
              className={cn(
                useSharedDesktopShell
                  ? "desktop-search-panel-content flex min-h-0 flex-1 flex-col"
                  : "contents",
              )}
            >
              {renderReviewStep?.({
                goToStep: changeStep,
                close: closePicker,
              })}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
