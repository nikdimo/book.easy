"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  format,
  isAfter,
  isBefore,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfToday,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  DayButton,
  getDefaultClassNames,
  type Locale,
} from "react-day-picker";
import { CalendarRange, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import type { GuestCounts } from "@/components/marketplace/marketplace-guest-selector";

function parseLocalYmd(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function suppressNextClick() {
  const handler = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  document.addEventListener("click", handler, { once: true, capture: true });
  const timer = window.setTimeout(
    () => document.removeEventListener("click", handler, { capture: true }),
    300
  );
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("click", handler, { capture: true });
  };
}

type Layout = "pill" | "hero" | "compact";
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
    e: React.PointerEvent<HTMLButtonElement>
  ) => void;
  dayMeta?: (date: Date) => MarketplaceDayMeta | undefined;
  dayVariant?: "default" | "availability";
};

const FLEXIBILITY_OPTIONS = [
  { value: 0, label: "Exact dates" },
  { value: 1, label: "+- 1 day" },
  { value: 2, label: "+- 2 days" },
  { value: 3, label: "+- 3 days" },
  { value: 7, label: "+- 7 days" },
  { value: 14, label: "+- 14 days" },
] as const;

const INITIAL_MOBILE_MONTH_COUNT = 6;
const INITIAL_DESKTOP_MONTH_COUNT = 8;
const MONTH_LOAD_STEP = 4;
const MAX_MONTH_COUNT = 24;
const EMPTY_GUEST_COUNTS: GuestCounts = {
  adults: 0,
  children: 0,
  infants: 0,
  pets: 0,
};

const DragContext = React.createContext<DragCtx | null>(null);

function getNightCount(range?: DateRange) {
  if (!range?.from || !range?.to) return 0;
  return Math.max(
    1,
    Math.round(
      (startOfDay(range.to).getTime() - startOfDay(range.from).getTime()) /
        86400000
    )
  );
}

function GuestRow({
  title,
  subtitle,
  value,
  onChange,
  linkText,
}: {
  title: string;
  subtitle: string;
  value: number;
  onChange: (next: number) => void;
  linkText?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/80 py-5 last:border-b-0">
      <div className="min-w-0 pr-2">
        <p className="text-base font-semibold text-foreground md:text-lg">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        {linkText ? (
          <button
            type="button"
            className="mt-1 text-sm text-muted-foreground underline underline-offset-4"
          >
            {linkText}
          </button>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 md:gap-4">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60 text-xl text-foreground disabled:opacity-35"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          aria-label={`Decrease ${title}`}
        >
          -
        </button>
        <span className="min-w-[1.5rem] text-center text-xl text-foreground tabular-nums md:text-2xl">
          {value}
        </span>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60 text-xl text-foreground"
          onClick={() => onChange(Math.min(16, value + 1))}
          aria-label={`Increase ${title}`}
        >
          +
        </button>
      </div>
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
  ...rest
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const ctx = React.useContext(DragContext);
  const defaultClassNames = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);
  const meta = ctx?.dayMeta?.(day.date);

  void onPointerDown;

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
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
    upstreamClick?.(e);
  };

  if (ctx?.dayVariant === "availability") {
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        data-day={day.date.toLocaleDateString(locale?.code)}
        data-ymd={toYmd(day.date)}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        className={cn(
          "relative z-10 flex h-full size-auto w-full min-w-(--cell-size) flex-col items-center justify-start border-0 bg-transparent px-1 py-1 font-normal leading-none shadow-none",
          "text-foreground hover:bg-transparent hover:text-foreground",
          modifiers.outside &&
            "text-muted-foreground/40 hover:text-muted-foreground/50",
          modifiers.disabled && "opacity-40",
          modifiers.range_middle &&
            "rounded-none bg-transparent text-foreground hover:bg-transparent",
          ctx?.hasRange &&
            (modifiers.range_start || modifiers.range_end) &&
            "touch-none cursor-grab active:cursor-grabbing select-none",
          defaultClassNames.day,
          className
        )}
        {...rest}
      >
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium md:h-8 md:w-8",
            isEndpoint
              ? "bg-[hsl(0_0%_13%)] text-white shadow-none"
              : "text-foreground"
          )}
        >
          {day.date.getDate()}
        </span>
        <span
          className={cn(
            "mt-1 text-[0.58rem] leading-none md:text-[0.62rem]",
            meta?.isCustomPrice ? "font-semibold text-primary" : "text-muted-foreground",
            modifiers.disabled && "opacity-0"
          )}
        >
          {meta?.sublabel ?? ""}
        </span>
      </Button>
    );
  }

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-ymd={toYmd(day.date)}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={cn(
        "relative z-10 flex aspect-square size-auto w-full min-w-(--cell-size) items-center justify-center border-0 font-normal leading-none",
        "text-foreground hover:bg-transparent hover:text-foreground",
        modifiers.outside &&
          "text-muted-foreground/40 hover:text-muted-foreground/50",
        modifiers.disabled && "opacity-40",
        modifiers.range_middle &&
          "rounded-none bg-transparent text-foreground hover:bg-transparent",
        isEndpoint &&
          "rounded-full bg-[hsl(0_0%_13%)] text-white shadow-none hover:bg-[hsl(0_0%_18%)] hover:text-white",
        ctx?.hasRange &&
          (modifiers.range_start || modifiers.range_end) &&
          "touch-none cursor-grab active:cursor-grabbing select-none",
        defaultClassNames.day,
        className
      )}
      {...rest}
    />
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
  initialSegment = "checkin",
  showBackToPlace = false,
  showDateFlexibility = true,
  showGuestStep = true,
  finalActionLabel = showGuestStep ? "Search" : "Done",
  onRangeStringsChange,
  onGuestCountsChange = () => undefined,
  onDateFlexibilityChange = () => undefined,
  onBackToPlace,
  onFinalAction,
  onSearchRequest = () => undefined,
  dateDialogTitle = "Choose dates",
  dateDialogDescription = "Choose your check-in and check-out dates.",
  hideDateSegmentCards = false,
  dayMeta,
  dayVariant = "default",
  dateModifiers,
  dateModifiersClassNames,
  renderDateFooter,
  className,
}: {
  layout: Layout;
  checkIn: string;
  checkOut: string;
  guestCounts?: GuestCounts;
  dateFlexibility?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialSegment?: "checkin" | "checkout";
  showBackToPlace?: boolean;
  showDateFlexibility?: boolean;
  showGuestStep?: boolean;
  finalActionLabel?: string;
  onRangeStringsChange: (next: { checkIn: string; checkOut: string }) => void;
  onGuestCountsChange?: (next: GuestCounts) => void;
  onDateFlexibilityChange?: (next: number) => void;
  onBackToPlace?: () => void;
  onFinalAction?: () => void;
  onSearchRequest?: () => void;
  dateDialogTitle?: string;
  dateDialogDescription?: string;
  hideDateSegmentCards?: boolean;
  dayMeta?: (date: Date) => MarketplaceDayMeta | undefined;
  dayVariant?: "default" | "availability";
  dateModifiers?: React.ComponentProps<typeof Calendar>["modifiers"];
  dateModifiersClassNames?: React.ComponentProps<typeof Calendar>["modifiersClassNames"];
  renderDateFooter?: (controls: {
    canGoNext: boolean;
    closePicker: () => void;
    resetDates: () => void;
    summaryText: string;
  }) => React.ReactNode;
  className?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>("dates");
  const [activeSegment, setActiveSegment] = React.useState<
    "checkin" | "checkout"
  >("checkin");
  const [isMobile, setIsMobile] = React.useState(false);
  const [visibleMonthCount, setVisibleMonthCount] = React.useState(
    INITIAL_DESKTOP_MONTH_COUNT
  );
  const [dragDisplayRange, setDragDisplayRange] = React.useState<
    DateRange | undefined
  >(undefined);
  const [isDragging, setIsDragging] = React.useState(false);
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);
  const dragFrameRef = React.useRef<number | null>(null);
  const pendingDragDateRef = React.useRef<Date | null>(null);
  const previousOpenRef = React.useRef(false);
  const openingFromTriggerRef = React.useRef(false);

  const dragRef = React.useRef<{
    edge: "from" | "to";
    currentFrom: Date;
    currentTo: Date;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    bodyScrollRef.current?.scrollTo({ top: 0 });
  }, [open, step]);

  React.useEffect(() => {
    if (!open || step !== "dates") return;
    setVisibleMonthCount(
      isMobile ? INITIAL_MOBILE_MONTH_COUNT : INITIAL_DESKTOP_MONTH_COUNT
    );
  }, [open, step, isMobile]);

  React.useEffect(() => {
    if (open && !previousOpenRef.current) {
      setStep("dates");
      if (openingFromTriggerRef.current) {
        openingFromTriggerRef.current = false;
      } else {
        setActiveSegment(initialSegment);
      }
    }
    previousOpenRef.current = open;
  }, [open, initialSegment]);

  React.useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  const selectedRange = React.useMemo<DateRange | undefined>(() => {
    const from = parseLocalYmd(checkIn);
    const to = parseLocalYmd(checkOut);
    if (!from && !to) return undefined;
    if (from && to) return { from, to };
    if (from) return { from, to: undefined };
    return undefined;
  }, [checkIn, checkOut]);

  const hasRange = Boolean(
    selectedRange?.from && selectedRange?.to && checkIn && checkOut
  );
  const calendarStartMonth = React.useMemo(() => {
    if (dayVariant === "availability") {
      return startOfMonth(startOfToday());
    }

    return startOfMonth(selectedRange?.from ?? new Date());
  }, [dayVariant, selectedRange?.from]);

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
    },
    [onRangeStringsChange]
  );

  const handleEndpointPointerDown = React.useCallback(
    (
      edge: "from" | "to",
      date: Date,
      e: React.PointerEvent<HTMLButtonElement>
    ) => {
      const from = selectedRange?.from;
      const to = selectedRange?.to;
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

        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const ymd = el?.closest?.("[data-ymd]")?.getAttribute("data-ymd");
        if (!ymd) return;
        const d = parseLocalYmd(ymd);
        if (!d) return;
        const d0 = startOfDay(d);
        if (isBefore(d0, startOfToday())) return;
        pendingDragDateRef.current = d0;

        if (dragFrameRef.current !== null) return;

        dragFrameRef.current = window.requestAnimationFrame(() => {
          dragFrameRef.current = null;
          const pendingDate = pendingDragDateRef.current;
          pendingDragDateRef.current = null;
          if (pendingDate) {
            updateDragPreview(pendingDate);
          }
        });
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);

        if (dragFrameRef.current !== null) {
          window.cancelAnimationFrame(dragFrameRef.current);
          dragFrameRef.current = null;
        }
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
          setActiveSegment("checkout");
        }
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [selectedRange, commitRange]
  );

  const dragCtx = React.useMemo<DragCtx>(
    () => ({
      hasRange,
      onEndpointPointerDown: handleEndpointPointerDown,
      dayMeta,
      dayVariant,
    }),
    [dayMeta, dayVariant, hasRange, handleEndpointPointerDown]
  );

  const calendarSelected = dragDisplayRange ?? selectedRange;
  const checkInLabel =
    selectedRange?.from && checkIn
      ? format(selectedRange.from, "MMM d")
      : "Add dates";
  const checkOutLabel =
    selectedRange?.to && checkOut
      ? format(selectedRange.to, "MMM d")
      : "Add dates";
  const mobileDatesLabel =
    checkIn && checkOut && selectedRange?.from && selectedRange?.to
      ? `${format(selectedRange.from, "MMM d")} - ${format(selectedRange.to, "MMM d")}`
      : "Add dates";
  const summaryText =
    calendarSelected?.from && calendarSelected?.to
      ? `${format(calendarSelected.from, "MMM d")} - ${format(calendarSelected.to, "MMM d")}`
      : calendarSelected?.from
        ? format(calendarSelected.from, "MMM d")
        : "Add dates";
  const nightCount = getNightCount(calendarSelected);
  const canGoNext =
    dayVariant === "availability"
      ? Boolean(calendarSelected?.from)
      : Boolean(calendarSelected?.from && calendarSelected?.to);

  const segmentActive = (seg: "checkin" | "checkout") =>
    open && step === "dates" && activeSegment === seg;

  const openSegment = (seg: "checkin" | "checkout") => {
    openingFromTriggerRef.current = true;
    setStep("dates");
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

  const closePicker = () => {
    setOpen(false);
    setStep("dates");
    setActiveSegment("checkin");
  };

  const pillSeg = (seg: "checkin" | "checkout") =>
    cn(
      "flex-1 min-w-0 rounded-full px-3 py-1.5 text-left outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      segmentActive(seg)
        ? "bg-background shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
        : "hover:bg-muted/25"
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
          : "hover:bg-muted/25"
    );

  const triggers = (
    <>
      {layout === "pill" ? (
        <div className="flex flex-1 min-w-0 items-stretch divide-x divide-border">
          <button
            type="button"
            className={cn(pillSeg("checkin"), "sm:hidden")}
            onClick={() => openSegment("checkin")}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Dates
            </span>
            <span className="block text-sm font-medium truncate">
              {mobileDatesLabel}
            </span>
          </button>
          <button
            type="button"
            className={cn(pillSeg("checkin"), "hidden sm:block")}
            onClick={() => openSegment("checkin")}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]">
              Check in
            </span>
            <span className="block text-sm font-medium truncate">
              {checkInLabel}
            </span>
          </button>
          <button
            type="button"
            className={cn(pillSeg("checkout"), "hidden sm:block")}
            onClick={() => openSegment("checkout")}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]">
              Check out
            </span>
            <span className="block text-sm font-medium truncate">
              {checkOutLabel}
            </span>
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-1 min-w-0 divide-x divide-border/80",
            layout === "compact" && "flex-row"
          )}
        >
          <button
            type="button"
            className={heroSeg("checkin")}
            onClick={() => openSegment("checkin")}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <CalendarRange className="mt-0.5 hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-semibold tracking-wide">
                Check in
              </span>
              <span
                className={cn(
                  "text-sm font-medium md:text-base",
                  !checkIn && "text-muted-foreground"
                )}
              >
                {checkInLabel}
              </span>
            </div>
          </button>
          <button
            type="button"
            className={heroSeg("checkout")}
            onClick={() => openSegment("checkout")}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <div className="min-w-0 flex-1 sm:pl-0">
              <span className="block text-xs font-semibold tracking-wide">
                Check out
              </span>
              <span
                className={cn(
                  "text-sm font-medium md:text-base",
                  !checkOut && "text-muted-foreground"
                )}
              >
                {checkOutLabel}
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
      onOpenChange={(nextOpen) => {
        if (nextOpen) setOpen(true);
        else closePicker();
      }}
    >
      <div className={cn("min-w-0", className)}>{triggers}</div>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border border-border/60 bg-background text-popover-foreground shadow-2xl outline-none",
            "left-3 right-3 top-4 bottom-4 h-auto max-h-[calc(100dvh-2rem)] rounded-[2rem]",
            dayVariant === "availability"
              ? "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[50rem] md:max-h-[calc(100dvh-5rem)] md:w-[58rem] md:max-w-[calc(100vw-4rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]"
              : "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:h-[50rem] md:max-h-[calc(100dvh-5rem)] md:w-[44rem] md:max-w-[calc(100vw-6rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[2rem]"
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="sr-only">
            <DialogPrimitive.Title>
              {step === "dates" ? dateDialogTitle : "Who"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description>
              {step === "dates"
                ? dateDialogDescription
                : "Choose how many guests are coming."}
            </DialogPrimitive.Description>
          </div>

          <div className="border-b border-border/70 bg-background px-4 pt-4 pb-4 md:px-6 md:pt-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <p className="text-lg font-semibold text-foreground md:text-2xl">
                {step === "dates" ? dateDialogTitle : "Who"}
              </p>
              <button
                type="button"
                onClick={closePicker}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close picker"
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
                        : "border-border bg-background hover:bg-muted/30"
                    )}
                  >
                    <span className="block truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground md:text-[11px] md:tracking-[0.14em]">
                      Check in
                    </span>
                    <span className="mt-1 block truncate text-[0.9rem] font-semibold leading-tight text-foreground md:text-base">
                      {checkInLabel}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSegment("checkout")}
                    className={cn(
                      "min-w-0 rounded-xl border px-2 py-2.5 text-left transition-colors md:rounded-2xl md:px-4 md:py-3",
                      segmentActive("checkout")
                        ? "border-foreground bg-muted/40"
                        : "border-border bg-background hover:bg-muted/30"
                    )}
                  >
                    <span className="block truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground md:text-[11px] md:tracking-[0.14em]">
                      Check out
                    </span>
                    <span className="mt-1 block truncate text-[0.9rem] font-semibold leading-tight text-foreground md:text-base">
                      {checkOutLabel}
                    </span>
                  </button>
                </div>
              )
            ) : (
              <div className="rounded-[1.5rem] border border-border bg-muted/20 px-4 py-4 md:px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      When
                    </p>
                    <p className="mt-1 text-base font-semibold text-foreground md:text-lg">
                      {summaryText}
                    </p>
                    {nightCount > 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {nightCount} night{nightCount === 1 ? "" : "s"}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-sm font-semibold text-foreground"
                    onClick={() => setStep("dates")}
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>

          {step === "dates" ? (
            <>
              <DragContext.Provider value={dragCtx}>
                <div
                  ref={bodyScrollRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    if (
                      el.scrollTop + el.clientHeight >=
                      el.scrollHeight - 320
                    ) {
                      setVisibleMonthCount((current) =>
                        Math.min(MAX_MONTH_COUNT, current + MONTH_LOAD_STEP)
                      );
                    }
                  }}
                  className={cn(
                    "flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-5 md:px-6 md:py-6",
                    isDragging && "cursor-grabbing select-none"
                  )}
                >
                  <div className="mx-auto w-full">
                    <Calendar
                      mode="range"
                      required={false}
                      resetOnSelect
                      selected={calendarSelected}
                      onSelect={(range) => {
                        commitRange(range);
                        if (range?.from && !range?.to) {
                          setActiveSegment("checkout");
                        }
                      }}
                      numberOfMonths={visibleMonthCount}
                      disabled={{ before: startOfToday() }}
                      defaultMonth={calendarStartMonth}
                      showOutsideDays={false}
                      modifiers={dateModifiers}
                      modifiersClassNames={dateModifiersClassNames}
                      className={cn(
                        "mx-auto bg-transparent p-0",
                        dayVariant === "availability"
                          ? "[--cell-size:3rem] md:[--cell-size:3.25rem]"
                          : "[--cell-size:2.15rem] md:[--cell-size:2.8rem]"
                      )}
                      classNames={{
                        root: "mx-auto w-full",
                        months: cn(
                          "mx-auto grid w-full grid-cols-1 justify-center gap-y-8 md:gap-y-10",
                          dayVariant === "availability"
                            ? "md:grid-cols-2 md:gap-x-6"
                            : "md:w-fit md:grid-cols-2 md:gap-x-8"
                        ),
                        month: cn(
                          "mx-auto w-full max-w-[19rem]",
                          dayVariant === "availability"
                            ? "md:w-[23rem] md:max-w-none"
                            : "md:w-[20rem] md:max-w-none"
                        ),
                        nav: "hidden",
                        month_caption:
                          "mb-3 flex h-8 w-full items-center justify-center text-lg font-bold text-foreground md:mb-4",
                        table: "mx-auto w-full border-collapse",
                        weekdays: "flex w-full",
                        weekday:
                          "flex-1 text-center text-[0.68rem] font-medium uppercase text-muted-foreground select-none md:text-[0.72rem]",
                        week: "mt-2 flex w-full",
                        day: cn(
                          dayVariant === "availability"
                            ? "group/day relative h-[3.2rem] min-w-0 flex-1 p-0 text-center md:h-[3.6rem] md:w-[3.25rem] md:flex-none"
                            : "group/day relative h-[2.2rem] min-w-0 flex-1 p-0 text-center md:h-11 md:w-11 md:flex-none",
                          "[&:first-child[data-range-end=true]]:rounded-l-full",
                          "[&:last-child[data-range-start=true]]:rounded-r-full"
                        ),
                        range_start:
                          "rounded-l-full bg-[hsl(220_12%_86%)] hover:bg-[hsl(220_12%_80%)] [&_button]:rounded-full",
                        range_middle:
                          "rounded-none bg-[hsl(220_12%_86%)] hover:bg-[hsl(220_12%_80%)] [&_button]:bg-transparent",
                        range_end:
                          "rounded-r-full bg-[hsl(220_12%_86%)] hover:bg-[hsl(220_12%_80%)] [&_button]:rounded-full",
                        outside: "opacity-0 pointer-events-none",
                        hidden: "invisible",
                      }}
                      components={{ DayButton: MarketplaceRangeDayButton }}
                    />
                  </div>
                </div>
              </DragContext.Provider>

              <div className="shrink-0 border-t border-border bg-background">
                {showDateFlexibility ? (
                  <div className="overflow-x-auto overflow-y-hidden px-4 py-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x md:px-6">
                    <div className="flex w-max gap-2 whitespace-nowrap pr-4 md:pr-6">
                      {FLEXIBILITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onDateFlexibilityChange(option.value)}
                          className={cn(
                            "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                            dateFlexibility === option.value
                              ? "border-foreground bg-background text-foreground"
                              : "border-border bg-background text-foreground hover:bg-muted/40"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div
                  className={cn(
                    "bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-4",
                    showDateFlexibility && "border-t border-border"
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
                        className="self-start rounded-full sm:min-w-[7rem]"
                        onClick={resetDates}
                      >
                        Reset
                      </Button>
                      <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                        {showBackToPlace ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="min-w-[7rem] rounded-full"
                            onClick={onBackToPlace}
                          >
                            Back
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          className="min-w-[7rem] rounded-full"
                          disabled={!canGoNext}
                          onClick={() => {
                            if (showGuestStep) {
                              setStep("guests");
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
                          {showGuestStep ? "Next" : finalActionLabel}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                ref={bodyScrollRef}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-6 md:py-6"
              >
                <div className="mx-auto w-full max-w-2xl rounded-[1.75rem] border border-border bg-background px-4 md:px-6">
                  <GuestRow
                    title="Adults"
                    subtitle="Ages 13 or above"
                    value={guestCounts.adults}
                    onChange={(adults) =>
                      onGuestCountsChange({ ...guestCounts, adults })
                    }
                  />
                  <GuestRow
                    title="Children"
                    subtitle="Ages 2 - 12"
                    value={guestCounts.children}
                    onChange={(children) =>
                      onGuestCountsChange({ ...guestCounts, children })
                    }
                  />
                  <GuestRow
                    title="Infants"
                    subtitle="Under 2"
                    value={guestCounts.infants}
                    onChange={(infants) =>
                      onGuestCountsChange({ ...guestCounts, infants })
                    }
                  />
                  <GuestRow
                    title="Pets"
                    subtitle=""
                    linkText="Bringing a service animal?"
                    value={guestCounts.pets}
                    onChange={(pets) =>
                      onGuestCountsChange({ ...guestCounts, pets })
                    }
                  />
                </div>
              </div>

              <div className="shrink-0 border-t border-border bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start rounded-full sm:min-w-[7rem]"
                    onClick={resetGuests}
                  >
                    Reset
                  </Button>
                  <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-w-[7rem] rounded-full"
                      onClick={() => setStep("dates")}
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      className="min-w-[7rem] rounded-full"
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
                      {finalActionLabel}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
