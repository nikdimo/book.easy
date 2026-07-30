"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
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
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GuestCounts } from "@/components/marketplace/marketplace-guest-selector";
import { pluralText, useI18n } from "@/lib/i18n/client";
import { useSearchLabels } from "@/components/marketplace/search-labels";
import type { SearchLabels } from "@/components/marketplace/search-labels";
import type { Resolved } from "@/lib/i18n/t";

function parseLocalYmd(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
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

type Layout = "pill" | "hero" | "compact" | "field";
type Step = "dates" | "guests";

type MarketplaceDayMeta = {
  sublabel?: string;
  isCustomPrice?: boolean;
};

type DragCtx = {
  hasRange: boolean;
  onEndpointPointerDown: (
    edge: "from" | "to",
    date: Date,
    e: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  dayMeta?: (date: Date) => MarketplaceDayMeta | undefined;
  dayVariant?: "default" | "availability";
  minimumStayHint?: (date: Date) => Resolved | undefined;
};

export const FLEXIBILITY_VALUES = [0, 1, 2, 3, 7, 14] as const;

function flexibilityLabels(labels: SearchLabels) {
  return {
    0: labels.exactDates,
    1: labels.flexible1,
    2: labels.flexible2,
    3: labels.flexible3,
    7: labels.flexible7,
    14: labels.flexible14,
  } as const;
}

export function DateFlexibilityRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const labels = useSearchLabels();
  const optionLabels = flexibilityLabels(labels);

  return (
    <div className="flex w-max gap-2 whitespace-nowrap pr-4 md:pr-6">
      {FLEXIBILITY_VALUES.map((optionValue) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          className={cn(
            "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            value === optionValue
              ? "border-foreground bg-background text-foreground"
              : "border-border bg-background text-foreground hover:bg-muted/40",
            optionLabels[optionValue].translated && "notranslate",
          )}
        >
          {optionLabels[optionValue].text}
        </button>
      ))}
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
  linkText,
  increaseDisabled = false,
}: {
  title: Resolved;
  subtitle?: Resolved;
  value: number;
  onChange: (next: number) => void;
  linkText?: Resolved;
  increaseDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/80 py-5 last:border-b-0">
      <div className="min-w-0 pr-2">
        <p
          className={cn(
            "text-base font-semibold text-foreground md:text-lg",
            title.translated && "notranslate",
          )}
        >
          {title.text}
        </p>
        {subtitle ? (
          <p
            className={cn(
              "mt-1 text-sm text-muted-foreground",
              subtitle.translated && "notranslate",
            )}
          >
            {subtitle.text}
          </p>
        ) : null}
        {linkText ? (
          <button
            type="button"
            className={cn(
              "mt-1 text-sm text-muted-foreground underline underline-offset-4",
              linkText.translated && "notranslate",
            )}
          >
            {linkText.text}
          </button>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 md:gap-4">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60 text-xl text-foreground disabled:opacity-35"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          aria-label={`Decrease ${title.text}`}
        >
          -
        </button>
        <span className="min-w-[1.5rem] text-center text-xl text-foreground tabular-nums md:text-2xl">
          {value}
        </span>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60 text-xl text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          onClick={() => onChange(Math.min(16, value + 1))}
          disabled={increaseDisabled || value >= 16}
          aria-label={`Increase ${title.text}`}
        >
          +
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
  className,
}: {
  guestCounts: GuestCounts;
  onGuestCountsChange: (next: GuestCounts) => void;
  /** Adults and children consume listing capacity; infants and pets do not. */
  maxOccupancy?: number;
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
        "mx-auto w-full max-w-2xl rounded-[1.75rem] border border-border bg-background px-4 md:px-6",
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
            {" + "}
            <span
              className={labels.pets.translated ? "notranslate" : undefined}
            >
              {labels.pets.text}
            </span>
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
        linkText={labels.petsHint}
        value={guestCounts.pets}
        onChange={(pets) => onGuestCountsChange({ ...guestCounts, pets })}
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
  const minimumStayHint = ctx?.minimumStayHint?.(day.date);

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
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (minimumStayHint) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    upstreamClick?.(e);
  };

  const withMinimumStayHint = (
    button: React.ReactElement,
  ): React.ReactElement => {
    if (!minimumStayHint) return button;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={`${day.date.toLocaleDateString(
              locale?.code ?? "en-US",
              {
                dateStyle: "long",
              },
            )}. ${minimumStayHint.text}`}
            className="block size-full cursor-not-allowed rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span
            className={minimumStayHint.translated ? "notranslate" : undefined}
          >
            {minimumStayHint.text}
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
        aria-disabled={minimumStayHint ? true : rest["aria-disabled"]}
        tabIndex={minimumStayHint ? -1 : rest.tabIndex}
        className={cn(
          "group/date relative z-10 flex h-full size-auto w-full min-w-(--cell-size) flex-col items-center justify-start border-0 bg-transparent px-1 py-1 font-normal leading-none shadow-none outline-none",
          "text-foreground hover:bg-transparent hover:text-foreground",
          modifiers.outside &&
            "text-muted-foreground/40 hover:text-muted-foreground/50",
          (modifiers.disabled || minimumStayHint) &&
            "cursor-not-allowed opacity-40",
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
              !minimumStayHint &&
              !isEndpoint &&
              "group-hover/date:shadow-[inset_0_0_0_1.5px_hsl(0_0%_12%)] group-focus-visible/date:shadow-[inset_0_0_0_2px_hsl(0_0%_12%)]",
          )}
        >
          {day.date.getDate()}
        </span>
        <span
          className={cn(
            "mt-1 text-[0.58rem] leading-none md:text-[0.62rem]",
            meta?.isCustomPrice
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
      aria-disabled={minimumStayHint ? true : rest["aria-disabled"]}
      tabIndex={minimumStayHint ? -1 : rest.tabIndex}
      className={cn(
        "group/date relative z-10 flex aspect-square size-auto w-full min-w-(--cell-size) items-center justify-center border-0 bg-transparent font-normal leading-none shadow-none outline-none",
        "text-foreground hover:bg-transparent hover:text-foreground",
        modifiers.outside &&
          "text-muted-foreground/40 hover:text-muted-foreground/50",
        (modifiers.disabled || minimumStayHint) &&
          "cursor-not-allowed opacity-40",
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
          "flex size-full items-center justify-center rounded-full transition-[box-shadow,background-color,color,transform] duration-150 ease-out",
          isEndpoint &&
            "bg-[hsl(0_0%_13%)] text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] group-hover/date:scale-[1.04] group-hover/date:bg-[hsl(0_0%_18%)]",
          !modifiers.disabled &&
            !minimumStayHint &&
            !isEndpoint &&
            "group-hover/date:shadow-[inset_0_0_0_1.5px_hsl(0_0%_12%)] group-focus-visible/date:shadow-[inset_0_0_0_2px_hsl(0_0%_12%)]",
        )}
      >
        {children}
      </span>
    </Button>,
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
  minimumStayMessage,
  fitViewport = false,
  pagedOnDesktop = false,
  pagedDesktopMonthCount = 1,
  locale,
}: {
  active: boolean;
  selected: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
  onFromOnlySelected?: () => void;
  disabledDateRanges?: { from: Date; to: Date }[];
  dayMeta?: (date: Date) => MarketplaceDayMeta | undefined;
  dayVariant?: "default" | "availability";
  dateModifiers?: React.ComponentProps<typeof Calendar>["modifiers"];
  dateModifiersClassNames?: React.ComponentProps<
    typeof Calendar
  >["modifiersClassNames"];
  minimumStayNights?: number;
  minimumStayMessage?: Resolved;
  fitViewport?: boolean;
  pagedOnDesktop?: boolean;
  pagedDesktopMonthCount?: 1 | 2;
  locale?: string;
}) {
  const labels = useSearchLabels();
  const calendarLocale = locale ?? labels.locale;
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

  const dragRef = React.useRef<{
    edge: "from" | "to";
    currentFrom: Date;
    currentTo: Date;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const pagedCalendar = fitViewport || (pagedOnDesktop && !isMobile);
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
      setPagedMonthCapacity(entry.contentRect.width >= 820 ? 2 : 1);
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
  const isMinimumStayRestricted = React.useCallback(
    (date: Date) => {
      if (!minimumStayAnchor || !minimumStayNights) return false;
      const distance = Math.abs(
        differenceInCalendarDays(startOfDay(date), minimumStayAnchor),
      );
      return distance > 0 && distance < minimumStayNights;
    },
    [minimumStayAnchor, minimumStayNights],
  );

  const calendarStartMonth = React.useMemo(() => {
    if (dayVariant === "availability") {
      return startOfMonth(startOfToday());
    }
    return startOfMonth(selected?.from ?? new Date());
  }, [dayVariant, selected?.from]);

  const commitRange = React.useCallback(
    (range: DateRange | undefined) => {
      onRangeChange(range);
      if (range?.from && !range?.to) onFromOnlySelected?.();
    },
    [onRangeChange, onFromOnlySelected],
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

      dragRef.current = {
        edge,
        currentFrom: startOfDay(from),
        currentTo: startOfDay(to),
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };

      const updateDragPreview = (nextDate: Date) => {
        const dr = dragRef.current;
        if (!dr) return;
        const d0 = startOfDay(nextDate);

        if (dr.edge === "from") {
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

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);

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

        suppressNextClick();

        if (dr?.moved) {
          commitRange({ from: dr.currentFrom, to: dr.currentTo });
        } else {
          commitRange({ from: date, to: undefined });
        }
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [selected, commitRange],
  );

  const dragCtx = React.useMemo<DragCtx>(
    () => ({
      hasRange,
      onEndpointPointerDown: handleEndpointPointerDown,
      dayMeta,
      dayVariant,
      minimumStayHint: (date) =>
        minimumStayMessage && isMinimumStayRestricted(date)
          ? minimumStayMessage
          : undefined,
    }),
    [
      dayMeta,
      dayVariant,
      handleEndpointPointerDown,
      hasRange,
      isMinimumStayRestricted,
      minimumStayMessage,
    ],
  );

  const calendarSelected = dragDisplayRange ?? selected;
  const disabledMatcher = React.useMemo(
    () => [{ before: startOfToday() }, ...disabledDateRanges],
    [disabledDateRanges],
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
            ? "shrink-0 overflow-hidden px-5 py-5 md:px-7 md:py-6"
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
        <div className="notranslate mx-auto w-full" translate="no">
          <Calendar
            mode="range"
            required={false}
            resetOnSelect
            excludeDisabled
            selected={calendarSelected}
            onSelect={(range) => commitRange(range)}
            numberOfMonths={pagedCalendar ? pagedMonthCount : visibleMonthCount}
            month={pagedCalendar ? displayMonth : undefined}
            onMonthChange={pagedCalendar ? setDisplayMonth : undefined}
            disabled={disabledMatcher}
            defaultMonth={calendarStartMonth}
            showOutsideDays={false}
            formatters={{
              formatCaption: (date) =>
                new Intl.DateTimeFormat(calendarLocale, {
                  month: "long",
                  year: "numeric",
                }).format(date),
              formatWeekdayName: (date) =>
                new Intl.DateTimeFormat(calendarLocale, {
                  weekday: "short",
                }).format(date),
            }}
            modifiers={dateModifiers}
            modifiersClassNames={dateModifiersClassNames}
            className={cn(
              "mx-auto bg-transparent p-0",
              dayVariant === "availability"
                ? "[--cell-size:3rem] md:[--cell-size:3.25rem]"
                : pagedCalendar
                  ? "[--cell-size:2.15rem] md:[--cell-size:2.55rem]"
                  : "[--cell-size:2.15rem] md:[--cell-size:2.8rem]",
            )}
            classNames={{
              root: "mx-auto w-full",
              months: cn(
                "relative mx-auto grid w-full grid-cols-1 justify-center gap-y-8 md:gap-y-10",
                pagedCalendar
                  ? pagedMonthCount === 2
                    ? "max-w-[49rem] md:grid-cols-2 md:gap-x-6"
                    : "w-fit"
                  : dayVariant === "availability"
                    ? "md:grid-cols-2 md:gap-x-6"
                    : "md:w-fit md:grid-cols-2 md:gap-x-8",
              ),
              month: cn(
                "mx-auto w-full max-w-[19rem]",
                dayVariant === "availability"
                  ? "md:w-[23rem] md:max-w-none"
                  : "md:w-[20rem] md:max-w-none",
              ),
              nav: pagedCalendar
                ? cn(
                    "absolute left-1/2 top-0 z-10 flex h-10 -translate-x-1/2 items-center justify-between",
                    pagedMonthCount === 2
                      ? "w-full max-w-[49rem]"
                      : "w-[17rem]",
                  )
                : "hidden",
              button_previous: pagedCalendar
                ? "flex h-10 w-10 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:size-5"
                : "hidden",
              button_next: pagedCalendar
                ? "flex h-10 w-10 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:size-5"
                : "hidden",
              month_caption:
                "mb-3 flex h-10 w-full items-center justify-center text-lg font-semibold text-foreground md:mb-4",
              table: "mx-auto w-full border-collapse",
              weekdays: "flex w-full",
              weekday:
                "flex-1 text-center text-[0.68rem] font-medium uppercase text-muted-foreground select-none md:text-[0.72rem]",
              week: "mt-2 flex w-full",
              day: cn(
                dayVariant === "availability"
                  ? "group/day relative h-[3.2rem] min-w-0 flex-1 p-0 text-center md:h-[3.6rem] md:w-[3.25rem] md:flex-none"
                  : pagedCalendar
                    ? "group/day relative h-[2.2rem] min-w-0 flex-1 p-0 text-center md:h-10 md:w-10 md:flex-none"
                    : "group/day relative h-[2.2rem] min-w-0 flex-1 p-0 text-center md:h-11 md:w-11 md:flex-none",
                "[&:first-child[data-range-end=true]]:rounded-l-full",
                "[&:last-child[data-range-start=true]]:rounded-r-full",
              ),
              // Selection tint is painted via an inset box-shadow rather than a
              // background-color utility. Blocked/booked days already carry their own
              // background-color modifier class (manualBlock/bookingHold) on this same
              // cell; box-shadow paints as a separate layer on top of that background,
              // so the "this day is selected" tint stays visible instead of losing an
              // unpredictable Tailwind class-order tie against the modifier's bg-*.
              range_start:
                "rounded-l-full shadow-[inset_0_0_0_999px_hsl(220_12%_86%)] hover:shadow-[inset_0_0_0_999px_hsl(220_12%_80%)] [&_button]:rounded-full",
              range_middle:
                "rounded-none shadow-[inset_0_0_0_999px_hsl(220_12%_86%)] hover:shadow-[inset_0_0_0_999px_hsl(220_12%_80%)] [&_button]:bg-transparent",
              range_end:
                "rounded-r-full shadow-[inset_0_0_0_999px_hsl(220_12%_86%)] hover:shadow-[inset_0_0_0_999px_hsl(220_12%_80%)] [&_button]:rounded-full",
              outside: "opacity-0 pointer-events-none",
              hidden: "invisible",
            }}
            components={{ DayButton: MarketplaceRangeDayButton }}
          />
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
  dayVariant = "default",
  dateModifiers,
  dateModifiersClassNames,
  minimumStayNights,
  minimumStayMessage,
  renderDateFooter,
  pagedCalendarOnDesktop = false,
  sharedPillActive = false,
  hidePillDivider = false,
  desktopContentRef,
  desktopContentStyle,
  useSharedDesktopShell = false,
  showPillGuestAction = false,
  closeOnRangeComplete = false,
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
  dayVariant?: "default" | "availability";
  dateModifiers?: React.ComponentProps<typeof Calendar>["modifiers"];
  dateModifiersClassNames?: React.ComponentProps<
    typeof Calendar
  >["modifiersClassNames"];
  minimumStayNights?: number;
  minimumStayMessage?: Resolved;
  renderDateFooter?: (controls: {
    canGoNext: boolean;
    closePicker: () => void;
    resetDates: () => void;
    summaryText: Resolved;
  }) => React.ReactNode;
  pagedCalendarOnDesktop?: boolean;
  sharedPillActive?: boolean;
  hidePillDivider?: boolean;
  desktopContentRef?: React.Ref<HTMLDivElement>;
  desktopContentStyle?: React.CSSProperties;
  useSharedDesktopShell?: boolean;
  showPillGuestAction?: boolean;
  closeOnRangeComplete?: boolean;
  dialogContentId?: string;
  className?: string;
}) {
  const labels = useSearchLabels();
  const resolvedDialogTitle = dateDialogTitle ?? labels.chooseDates;
  const resolvedDialogDescription =
    dateDialogDescription ?? labels.chooseDatesDescription;
  const resolvedFinalActionLabel =
    finalActionLabel ?? (showGuestStep ? labels.search : labels.done);
  const isPillLayout = layout === "pill";
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>(initialStep);
  const [activeSegment, setActiveSegment] = React.useState<
    "checkin" | "checkout"
  >("checkin");
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);
  const previousOpenRef = React.useRef(false);
  const openingFromTriggerRef = React.useRef(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
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
      onRangeStringsChange({
        checkIn: toYmd(range.from),
        checkOut: toYmd(range.to),
      });
      if (closeOnRangeComplete) closePicker();
    },
    [closeOnRangeComplete, closePicker, onRangeStringsChange],
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
      "flex-1 min-w-0 rounded-full px-6 py-2.5 text-left outline-none transition-[background-color,box-shadow,transform] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      segmentActive(seg)
        ? sharedPillActive
          ? ""
          : "bg-white shadow-[0_2px_10px_rgba(15,23,42,0.12)]"
        : "hover:bg-black/[0.035]",
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
              "notranslate truncate text-sm font-medium",
              !(checkIn && checkOut) && "text-muted-foreground",
              mobileDatesLabel.translated && "notranslate",
            )}
            translate="no"
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
            <span
              className={cn(
                "block text-[0.72rem] font-semibold leading-4 text-foreground",
                labels.when.translated && "notranslate",
              )}
            >
              {labels.when.text}
            </span>
            <span
              className={cn(
                "notranslate mt-px block truncate text-sm leading-5 font-normal",
                mobileDatesLabel.translated && "notranslate",
              )}
              translate="no"
              suppressHydrationWarning
            >
              {mobileDatesLabel.text}
            </span>
          </button>
          <button
            type="button"
            className={cn(
              pillSeg("checkin"),
              "relative hidden sm:block after:absolute after:right-0 after:top-1/2 after:h-8 after:w-px after:-translate-y-1/2 after:bg-black/8 after:transition-opacity after:duration-150",
              segmentActive("checkin") && "after:opacity-0",
              segmentActive("checkout") && "after:opacity-0",
              hidePillDivider && "after:opacity-0",
            )}
            onClick={() => openSegment("checkin")}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls={dialogContentId}
          >
            <span
              className={cn(
                "block text-[0.72rem] font-semibold leading-4 text-foreground",
                labels.when.translated && "notranslate",
              )}
            >
              {labels.when.text}
            </span>
            <span
              className={cn(
                "notranslate mt-px block truncate text-sm leading-5 font-normal",
                summaryText.translated && "notranslate",
              )}
              translate="no"
              suppressHydrationWarning
            >
              {summaryText.text}
            </span>
          </button>
        </div>
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
                  "notranslate text-sm font-medium md:text-base",
                  !checkIn && "text-muted-foreground",
                  checkInLabel.translated && "notranslate",
                )}
                translate="no"
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
                  "notranslate text-sm font-medium md:text-base",
                  !checkOut && "text-muted-foreground",
                  checkOutLabel.translated && "notranslate",
                )}
                translate="no"
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
      <div className={cn("notranslate min-w-0", className)} translate="no">
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
          translate="no"
          className={cn(
            "notranslate",
            useSharedDesktopShell
              ? "fixed z-[52] flex h-auto flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-background text-popover-foreground shadow-[0_10px_32px_rgba(0,0,0,0.16)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=open]:duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-2 data-[state=closed]:duration-100"
              : "fixed z-50 flex flex-col overflow-hidden border border-border/60 bg-background text-popover-foreground shadow-[0_10px_32px_rgba(0,0,0,0.16)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-2",
            !useSharedDesktopShell &&
              "left-3 right-3 top-4 bottom-4 h-auto max-h-[calc(100dvh-2rem)] rounded-[2rem]",
            !useSharedDesktopShell && isPillLayout
              ? dayVariant === "availability"
                ? "md:left-1/2 md:right-auto md:top-[5.75rem] md:bottom-auto md:h-auto md:max-h-[min(44rem,calc(100dvh-7rem))] md:w-[58rem] md:max-w-[calc(100vw-4rem)] md:-translate-x-1/2 md:rounded-[2rem]"
                : "md:left-1/2 md:right-auto md:top-[5.75rem] md:bottom-auto md:h-auto md:max-h-[min(35rem,calc(100dvh-7rem))] md:w-[45rem] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:rounded-[1.75rem]"
              : !useSharedDesktopShell && dayVariant === "availability"
                ? "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[50rem] md:max-h-[calc(100dvh-5rem)] md:w-[58rem] md:max-w-[calc(100vw-4rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]"
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
              className={
                (step === "dates" ? resolvedDialogTitle : labels.who).translated
                  ? "notranslate"
                  : undefined
              }
            >
              {step === "dates" ? resolvedDialogTitle.text : labels.who.text}
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

          {!isPillLayout ? (
            <div className="border-b border-border/70 bg-background px-4 pt-4 pb-4 md:px-6 md:pt-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <p
                  className={cn(
                    "text-lg font-semibold text-foreground md:text-2xl",
                    (step === "dates" ? resolvedDialogTitle : labels.who)
                      .translated && "notranslate",
                  )}
                >
                  {step === "dates"
                    ? resolvedDialogTitle.text
                    : labels.who.text}
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

              {step === "dates" ? (
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
                          "notranslate mt-1 block truncate text-[0.9rem] font-semibold leading-tight text-foreground md:text-base",
                          checkInLabel.translated && "notranslate",
                        )}
                        translate="no"
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
                          "notranslate mt-1 block truncate text-[0.9rem] font-semibold leading-tight text-foreground md:text-base",
                          checkOutLabel.translated && "notranslate",
                        )}
                        translate="no"
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
                          "notranslate mt-1 text-base font-semibold text-foreground md:text-lg",
                          summaryText.translated && "notranslate",
                        )}
                        translate="no"
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

          {step === "dates" ? (
            <div
              key="dates"
              className={cn(
                useSharedDesktopShell
                  ? "desktop-search-panel-content flex min-h-0 flex-1 flex-col"
                  : "contents",
              )}
            >
              <DateRangeCalendarStep
                active={open && step === "dates"}
                selected={selectedRange}
                onRangeChange={commitRange}
                onFromOnlySelected={() => setActiveSegment("checkout")}
                disabledDateRanges={disabledDateRanges}
                dayMeta={dayMeta}
                dayVariant={dayVariant}
                dateModifiers={dateModifiers}
                dateModifiersClassNames={dateModifiersClassNames}
                minimumStayNights={minimumStayNights}
                minimumStayMessage={minimumStayMessage}
                fitViewport={isPillLayout}
                pagedOnDesktop={pagedCalendarOnDesktop}
              />

              <div className="shrink-0 border-t border-border bg-background">
                {showDateFlexibility ? (
                  <div className="overflow-x-auto overflow-y-hidden px-4 py-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x md:px-6">
                    <DateFlexibilityRow
                      value={dateFlexibility}
                      onChange={onDateFlexibilityChange}
                    />
                  </div>
                ) : null}

                {!isPillLayout ? (
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
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "self-start rounded-full sm:min-w-[7rem]",
                            labels.reset.translated && "notranslate",
                          )}
                          onClick={resetDates}
                        >
                          {labels.reset.text}
                        </Button>
                        <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
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
                              (showGuestStep
                                ? labels.next
                                : resolvedFinalActionLabel
                              ).translated && "notranslate",
                            )}
                            disabled={!canGoNext}
                            onClick={() => {
                              if (showGuestStep) {
                                changeStep("guests");
                                return;
                              }

                              if (onFinalAction) {
                                onFinalAction();
                              } else {
                                onSearchRequest();
                              }
                              closePicker();
                            }}
                          >
                            {showGuestStep
                              ? labels.next.text
                              : resolvedFinalActionLabel.text}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
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
                />
              </div>

              {isPillLayout && showPillGuestAction ? (
                <div className="shrink-0 border-t border-border bg-background px-4 py-3 md:px-6">
                  <Button
                    type="button"
                    className="w-full rounded-full"
                    onClick={() => {
                      if (onFinalAction) onFinalAction();
                      else onSearchRequest();
                      closePicker();
                    }}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    {resolvedFinalActionLabel.text}
                  </Button>
                </div>
              ) : null}

              {!isPillLayout ? (
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
                        onClick={() => {
                          if (onFinalAction) {
                            onFinalAction();
                          } else {
                            onSearchRequest();
                          }
                          closePicker();
                        }}
                      >
                        <Search className="mr-2 h-4 w-4" />
                        {resolvedFinalActionLabel.text}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
