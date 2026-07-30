"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isWithinInterval,
  startOfMonth,
} from "date-fns";
import {
  BadgePercent,
  BedDouble,
  CalendarRange,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Eye,
  EyeOff,
  LockKeyhole,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  UnlockKeyhole,
  X,
} from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { DateRangeCalendarStep } from "@/components/marketplace/marketplace-stay-date-picker";
import { Button } from "@/components/ui/button";
import { Calendar as MiniCalendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Throwaway interactive prototype. Nothing outside src/app/(dev) imports this file.

type EditorKey = "availability" | "prices" | "promotions";
type ChangeKind = "booking" | "block" | "price" | "promotion";
type ChangeFilter = "all" | ChangeKind;

interface DateSelection {
  from: Date;
  to: Date;
}

interface ScheduledChange {
  id: string;
  kind: ChangeKind;
  from: Date;
  to: Date;
  label: string;
  detail: string;
  source: string;
  promotion?: {
    scope: "always" | "dates";
    percent: number;
    minimumNights: number;
    freeCleaning: boolean;
  };
}

interface DrawerState {
  editor: EditorKey;
  range: DateSelection | null;
  promotion?: ScheduledChange["promotion"];
}

const TODAY = new Date(2026, 6, 29);
const INITIAL_MONTH = new Date(2026, 6, 1);
const BASE_RATE = 95;

const POPULATED_CHANGES: ScheduledChange[] = [
  {
    id: "booking-jul",
    kind: "booking",
    from: new Date(2026, 6, 30),
    to: new Date(2026, 7, 1),
    label: "Booked",
    detail: "Guest reservation",
    source: "Booking #1048",
  },
  {
    id: "booking-aug",
    kind: "booking",
    from: new Date(2026, 7, 3),
    to: new Date(2026, 7, 8),
    label: "Booked",
    detail: "6 nights",
    source: "Booking #1051",
  },
  {
    id: "promo-always-5",
    kind: "promotion",
    from: TODAY,
    to: new Date(2027, 11, 31),
    label: "10% off + free cleaning",
    detail: "5–9 nights · Always active",
    source: "Longer stay",
    promotion: {
      scope: "always",
      percent: 10,
      minimumNights: 5,
      freeCleaning: true,
    },
  },
  {
    id: "promo-always-10",
    kind: "promotion",
    from: TODAY,
    to: new Date(2027, 11, 31),
    label: "15% off",
    detail: "10–29 nights · Always active",
    source: "Extended stay",
    promotion: {
      scope: "always",
      percent: 15,
      minimumNights: 10,
      freeCleaning: false,
    },
  },
  {
    id: "promo-summer",
    kind: "promotion",
    from: new Date(2026, 7, 9),
    to: new Date(2026, 7, 14),
    label: "20% off + free cleaning",
    detail: "7+ nights · Specific dates",
    source: "Summer offer",
    promotion: {
      scope: "dates",
      percent: 20,
      minimumNights: 7,
      freeCleaning: true,
    },
  },
  {
    id: "promo-always-30",
    kind: "promotion",
    from: TODAY,
    to: new Date(2027, 11, 31),
    label: "25% off + free cleaning",
    detail: "30+ nights · Always active",
    source: "Monthly stay",
    promotion: {
      scope: "always",
      percent: 25,
      minimumNights: 30,
      freeCleaning: true,
    },
  },
  {
    id: "block-aug",
    kind: "block",
    from: new Date(2026, 7, 16),
    to: new Date(2026, 7, 18),
    label: "Blocked",
    detail: "Owner stay",
    source: "Manual block",
  },
  {
    id: "price-aug",
    kind: "price",
    from: new Date(2026, 7, 22),
    to: new Date(2026, 7, 27),
    label: "€160 / night",
    detail: "Base price €95",
    source: "Custom price",
  },
  {
    id: "price-sep",
    kind: "price",
    from: new Date(2026, 8, 7),
    to: new Date(2026, 8, 9),
    label: "€75 / night",
    detail: "Base price €95",
    source: "Custom price",
  },
];

const CHANGE_FILTERS: { value: ChangeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "block", label: "Blocks" },
  { value: "price", label: "Prices" },
  { value: "promotion", label: "Promotions" },
  { value: "booking", label: "Reservations" },
];

function editorForChange(kind: ChangeKind): EditorKey {
  if (kind === "price") return "prices";
  if (kind === "promotion") return "promotions";
  return "availability";
}

function formatRange(from: Date, to: Date, includeYear = false) {
  if (isSameDay(from, to)) {
    return format(from, includeYear ? "MMM d, yyyy" : "MMM d");
  }
  if (from.getMonth() === to.getMonth()) {
    return `${format(from, "MMM d")}–${format(to, includeYear ? "d, yyyy" : "d")}`;
  }
  return `${format(from, "MMM d")}–${format(to, includeYear ? "MMM d, yyyy" : "MMM d")}`;
}

function rateForDate(date: Date, changes: ScheduledChange[]) {
  const customPrice = changes.find(
    (change) =>
      change.kind === "price" &&
      isWithinInterval(date, { start: change.from, end: change.to })
  );
  if (!customPrice) return BASE_RATE;
  return customPrice.id === "price-aug" ? 160 : 75;
}

function MonthGrid({
  month,
  changes,
  selection,
  onSelect,
}: {
  month: Date;
  changes: ScheduledChange[];
  selection: DateSelection | null;
  onSelect: (date: Date) => void;
}) {
  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({
    start: monthStart,
    end: endOfMonth(month),
  });

  return (
    <section aria-label={format(month, "MMMM yyyy")} className="min-w-0">
      <h2 className="mb-5 text-center text-sm font-semibold">
        {format(month, "MMMM yyyy")}
      </h2>
      <div className="grid grid-cols-7">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="pb-2 text-center text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase"
          >
            {day}
          </div>
        ))}
        {Array.from({ length: monthStart.getDay() }).map((_, index) => (
          <div key={`blank-${index}`} aria-hidden="true" className="h-[4.75rem]" />
        ))}
        {days.map((day) => {
          const disabled = isBefore(day, TODAY);
          const dayChanges = changes.filter((change) =>
            isWithinInterval(day, { start: change.from, end: change.to })
          );
          const booking = dayChanges.find((change) => change.kind === "booking");
          const block = dayChanges.find((change) => change.kind === "block");
          const promotion = dayChanges.find(
            (change) =>
              change.kind === "promotion" && change.promotion?.scope !== "always"
          );
          const customRate = dayChanges.some((change) => change.kind === "price");
          const selected =
            selection &&
            isWithinInterval(day, { start: selection.from, end: selection.to });
          const endpoint =
            selection &&
            (isSameDay(day, selection.from) || isSameDay(day, selection.to));

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(day)}
              aria-label={`${format(day, "EEEE, MMMM do, yyyy")}, €${rateForDate(
                day,
                changes
              )} per night`}
              className={cn(
                "group relative flex h-[4.75rem] min-w-0 flex-col items-center justify-center border-y border-transparent px-0.5 transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                disabled && "cursor-not-allowed text-muted-foreground/35",
                !disabled && "hover:bg-muted/60",
                selected && "border-stone-300 bg-stone-200/80 hover:bg-stone-200",
                booking && !selected && "bg-rose-50 hover:bg-rose-100/70",
                block &&
                  !selected &&
                  "bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,rgba(120,113,108,0.13)_5px,rgba(120,113,108,0.13)_10px)]"
              )}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full text-sm font-medium",
                  endpoint && "bg-foreground text-background",
                  isSameDay(day, TODAY) && !endpoint && "ring-1 ring-foreground/25"
                )}
              >
                {format(day, "d")}
              </span>
              {!disabled ? (
                <span
                  className={cn(
                    "mt-0.5 text-[0.64rem] tabular-nums text-muted-foreground",
                    customRate && "font-semibold text-primary"
                  )}
                >
                  €{rateForDate(day, changes)}
                </span>
              ) : null}
              {!disabled && (booking || block) ? (
                <span
                  className={cn(
                    "mt-0.5 max-w-full truncate text-[0.58rem] font-medium",
                    booking ? "text-rose-700" : "text-muted-foreground"
                  )}
                >
                  {booking ? "Booked" : "Blocked"}
                </span>
              ) : null}
              {!disabled && promotion ? (
                <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-amber-500">
                  <span className="sr-only">{promotion.label}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DateFilterField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 min-w-36 items-center gap-2 rounded-lg border bg-background px-3 text-left transition-colors hover:border-foreground/25"
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          <span>
            <span className="block text-[0.6rem] leading-none text-muted-foreground uppercase">
              {label}
            </span>
            <span className="mt-1 block text-xs font-medium">
              {value ? format(value, "MMM d, yyyy") : "Any date"}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1">
        <MiniCalendar
          mode="single"
          selected={value}
          defaultMonth={value ?? TODAY}
          disabled={disabled}
          onSelect={(date) => {
            onChange(date);
            if (date) setOpen(false);
          }}
        />
        {value ? (
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              Clear {label.toLowerCase()}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function InlineDateScope({
  label,
  from,
  to,
  onOpen,
}: {
  label: string;
  from?: Date;
  to?: Date;
  onOpen: () => void;
}) {
  const hasRange = Boolean(from && to);
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold">{label}</p>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/75"
      >
        <CalendarRange className="size-3.5" />
        {hasRange ? `${formatRange(from!, to!)} · Change dates` : "Select dates"}
      </button>
    </div>
  );
}

function RangePickerDialog({
  open,
  value,
  title,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  value?: DateRange;
  title: string;
  onOpenChange: (open: boolean) => void;
  onApply: (range?: DateRange) => void;
}) {
  const [draft, setDraft] = useState<DateRange | undefined>(value);

  const normalizedDraft = draft?.from
    ? { from: draft.from, to: draft.to ?? draft.from }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-[52rem]">
        <DialogHeader>
          <div className="border-b px-6 py-5 pr-12 text-left">
            <DialogTitle className="text-lg">{title}</DialogTitle>
            <DialogDescription className="mt-0.5">
              Select one date or drag across a date range.
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <DateRangeCalendarStep
            active={open}
            pagedOnDesktop
            selected={draft}
            onRangeChange={setDraft}
            dayVariant="availability"
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-background px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              onApply(undefined);
              onOpenChange(false);
            }}
          >
            Clear dates
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!normalizedDraft}
              onClick={() => {
                onApply(normalizedDraft);
                onOpenChange(false);
              }}
            >
              Use selected dates
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoundUpControl({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-4 rounded-xl border bg-muted/20 p-3 text-left transition-colors hover:border-primary/30"
    >
      <span>
        <span className="block text-xs font-semibold">Round up to the nearest €5</span>
        <span className="mt-0.5 block text-[0.65rem] text-muted-foreground">
          Keeps guest-facing prices clean and easy to scan.
        </span>
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          enabled ? "bg-primary" : "bg-muted-foreground/25"
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform",
            enabled ? "translate-x-6" : "translate-x-1"
          )}
        />
      </span>
    </button>
  );
}

function EditorDialog({
  state,
  onStateChange,
}: {
  state: DrawerState | null;
  onStateChange: (state: DrawerState | null) => void;
}) {
  const [availabilityChoice, setAvailabilityChoice] = useState<
    "available" | "blocked"
  >("blocked");
  const [availabilityScope, setAvailabilityScope] = useState<
    "LISTING" | "DATES"
  >(state?.range ? "DATES" : "LISTING");
  const [listingVisibility, setListingVisibility] = useState<
    "VISIBLE" | "HIDDEN"
  >("HIDDEN");
  const [availabilityFrom, setAvailabilityFrom] = useState<Date | undefined>(
    state?.range?.from
  );
  const [availabilityTo, setAvailabilityTo] = useState<Date | undefined>(
    state?.range?.to
  );
  const [reason, setReason] = useState("");
  const [priceScope, setPriceScope] = useState<"DEFAULT" | "DATES">(
    state?.range ? "DATES" : "DEFAULT"
  );
  const [priceFrom, setPriceFrom] = useState<Date | undefined>(
    state?.range?.from
  );
  const [priceTo, setPriceTo] = useState<Date | undefined>(
    state?.range?.to
  );
  const [price, setPrice] = useState(state?.range ? "160" : String(BASE_RATE));
  const [roundPrice, setRoundPrice] = useState(true);
  const [percent, setPercent] = useState(
    String(state?.promotion?.percent ?? 15)
  );
  const [freeCleaning, setFreeCleaning] = useState(
    state?.promotion?.freeCleaning ?? false
  );
  const [eligibility, setEligibility] = useState<"ALL" | "MINIMUM">("MINIMUM");
  const [minimumNights, setMinimumNights] = useState(
    String(state?.promotion?.minimumNights ?? 5)
  );
  const [roundPromotion, setRoundPromotion] = useState(true);
  const [promotionScope, setPromotionScope] = useState<"ALWAYS" | "DATES">(
    state?.promotion?.scope === "always" || !state?.range ? "ALWAYS" : "DATES"
  );
  const [promotionFrom, setPromotionFrom] = useState<Date | undefined>(
    state?.range?.from
  );
  const [promotionTo, setPromotionTo] = useState<Date | undefined>(
    state?.range?.to
  );
  const [rangePickerOpen, setRangePickerOpen] = useState(false);

  if (!state) return null;

  const nights = state.range
    ? eachDayOfInterval({
        start: state.range.from,
        end: state.range.to,
      }).length
    : 0;
  const save = (message: string) => {
    const scopeDescription =
      state.editor === "promotions"
        ? promotionScope === "ALWAYS"
          ? "Always active"
          : promotionFrom && promotionTo
            ? formatRange(promotionFrom, promotionTo)
            : "Specific dates"
        : state.editor === "availability"
          ? availabilityScope === "LISTING"
            ? "Listing visibility"
            : availabilityFrom && availabilityTo
              ? formatRange(availabilityFrom, availabilityTo)
              : "Calendar dates"
          : state.editor === "prices"
            ? priceScope === "DEFAULT"
              ? "Default nightly price"
              : priceFrom && priceTo
                ? formatRange(priceFrom, priceTo)
                : "Specific dates"
        : state.range
          ? formatRange(state.range.from, state.range.to)
          : "Selected dates";
    toast.success(message, {
      description: `${scopeDescription} · mockup only`,
    });
    onStateChange(null);
  };
  const editorMeta =
    state.editor === "availability"
      ? {
          title: "Manage availability",
          description: "Control listing visibility or calendar dates.",
          icon: LockKeyhole,
        }
      : state.editor === "prices"
        ? {
            title: "Manage pricing",
            description: "Change the default rate or price specific dates.",
            icon: CircleDollarSign,
          }
        : {
            title: state.promotion ? "Edit promotion" : "Create a promotion",
            description: "Set the stay threshold, benefits, and date scope.",
            icon: BadgePercent,
          };
  const HeaderIcon = editorMeta.icon;
  const rangeLabel =
    state.editor === "promotions"
      ? promotionScope === "ALWAYS"
        ? "Always active · no end date"
        : promotionFrom && promotionTo
          ? `${formatRange(promotionFrom, promotionTo, true)} · selected dates`
          : "Choose the promotion dates"
      : state.editor === "availability"
        ? availabilityScope === "LISTING"
          ? "Listing visibility · currently visible"
          : availabilityFrom && availabilityTo
            ? `${formatRange(availabilityFrom, availabilityTo, true)} · calendar dates`
            : "Choose calendar dates"
        : state.editor === "prices"
          ? priceScope === "DEFAULT"
            ? `Default nightly price · €${BASE_RATE}`
            : priceFrom && priceTo
              ? `${formatRange(priceFrom, priceTo, true)} · custom price`
              : "Choose pricing dates"
          : state.range
            ? `${formatRange(state.range.from, state.range.to, true)} · ${nights} ${
                nights === 1 ? "night" : "nights"
              }`
            : "Select dates";
  const formatAdjustedPrice = (value: number, roundUp: boolean) =>
    String(roundUp ? Math.ceil(value / 5) * 5 : Number(value.toFixed(2)));
  const numericPercent = Math.min(50, Math.max(0, Number(percent) || 0));
  const rawPromotionPrice = BASE_RATE * (1 - numericPercent / 100);
  const promotionGuestPrice = formatAdjustedPrice(rawPromotionPrice, roundPromotion);
  const hasDiscount = numericPercent > 0;
  const hasPromotion = hasDiscount || freeCleaning;
  const promotionBenefits = [
    hasDiscount ? `${numericPercent}% off` : null,
    freeCleaning ? "free cleaning" : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const pickerValue =
    state.editor === "availability"
      ? availabilityFrom && availabilityTo
        ? { from: availabilityFrom, to: availabilityTo }
        : undefined
      : state.editor === "prices"
        ? priceFrom && priceTo
          ? { from: priceFrom, to: priceTo }
          : undefined
        : promotionFrom && promotionTo
          ? { from: promotionFrom, to: promotionTo }
          : undefined;
  const pickerTitle =
    state.editor === "availability"
      ? "Select availability dates"
      : state.editor === "prices"
        ? "Select pricing dates"
        : "Select promotion dates";
  const applyPickerRange = (range?: DateRange) => {
    const from = range?.from;
    const to = range?.to ?? range?.from;
    if (state.editor === "availability") {
      setAvailabilityFrom(from);
      setAvailabilityTo(to);
      setAvailabilityScope(from && to ? "DATES" : "LISTING");
      return;
    }
    if (state.editor === "prices") {
      setPriceFrom(from);
      setPriceTo(to);
      setPriceScope(from && to ? "DATES" : "DEFAULT");
      if (from && to && !state.range && price === String(BASE_RATE)) {
        setPrice("160");
      }
      if (!from && !to && !state.range && price === "160") {
        setPrice(String(BASE_RATE));
      }
      return;
    }
    setPromotionFrom(from);
    setPromotionTo(to);
    setPromotionScope(from && to ? "DATES" : "ALWAYS");
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onStateChange(null)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[34rem]">
        <DialogHeader>
          <div className="flex items-start gap-3 border-b px-6 py-5 pr-12 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <HeaderIcon className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-lg">{editorMeta.title}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {editorMeta.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="border-b bg-muted/25 px-6 py-3">
          <p className="flex items-center gap-2 text-xs font-medium">
            <CalendarRange className="size-3.5 text-muted-foreground" />
            {rangeLabel}
          </p>
        </div>

        {state.editor === "availability" ? (
          <div className="space-y-5 p-6">
            <InlineDateScope
              label="What would you like to manage?"
              from={availabilityFrom}
              to={availabilityTo}
              onOpen={() => setRangePickerOpen(true)}
            />

            {availabilityScope === "LISTING" ? (
              <fieldset>
                <legend className="text-sm font-semibold">Listing visibility</legend>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(
                    [
                      {
                        value: "VISIBLE",
                        label: "Visible",
                        description: "Guests can find and request this listing",
                        icon: Eye,
                      },
                      {
                        value: "HIDDEN",
                        label: "Hidden from site",
                        description: "Stop new booking requests",
                        icon: EyeOff,
                      },
                    ] as const
                  ).map((option) => {
                    const selected = listingVisibility === option.value;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setListingVisibility(option.value)}
                        className={cn(
                          "relative rounded-xl border p-4 text-left transition-all",
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:border-primary/35 hover:bg-muted/30"
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-5",
                            selected ? "text-primary" : "text-muted-foreground"
                          )}
                        />
                        <span className="mt-4 block text-sm font-semibold">
                          {option.label}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {option.description}
                        </span>
                        {selected ? (
                          <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <fieldset>
                <legend className="text-sm font-semibold">
                  Availability for these dates
                </legend>
                <div className="mt-3 grid grid-cols-2 gap-3">
                {(
                  [
                    {
                      value: "available",
                      label: "Available",
                      description: "Guests can request these nights",
                      icon: BedDouble,
                    },
                    {
                      value: "blocked",
                      label: "Blocked",
                      description: "Prevent new booking requests",
                      icon: LockKeyhole,
                    },
                  ] as const
                ).map((option) => {
                  const selected = availabilityChoice === option.value;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setAvailabilityChoice(option.value)}
                      className={cn(
                        "relative rounded-xl border p-4 text-left transition-all",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:border-primary/35 hover:bg-muted/30"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5",
                          selected ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <span className="mt-4 block text-sm font-semibold">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {option.description}
                      </span>
                      {selected ? (
                        <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              </fieldset>
            )}

            {availabilityScope === "DATES" && availabilityChoice === "blocked" ? (
              <div>
                <Label htmlFor="block-reason" className="mb-1.5 block text-sm font-semibold">
                  Block reason{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="block-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="e.g. Maintenance or private stay"
                />
              </div>
            ) : null}

            <div className="flex gap-3 rounded-xl border bg-muted/25 p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {availabilityScope === "LISTING"
                  ? "Existing reservations remain protected. A hidden listing must be submitted for review again before guests can book it."
                  : "Existing reservations remain protected. Making dates available only removes manual blocks."}
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => onStateChange(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() =>
                  save(
                    availabilityScope === "LISTING"
                      ? listingVisibility === "HIDDEN"
                        ? "Listing hidden from the site"
                        : "Listing remains visible"
                      : availabilityChoice === "blocked"
                        ? "Dates blocked"
                        : "Dates made available"
                  )
                }
              >
                {availabilityScope === "LISTING"
                  ? listingVisibility === "HIDDEN"
                    ? "Hide from site"
                    : "Keep visible"
                  : availabilityChoice === "blocked"
                    ? "Block dates"
                    : "Make available"}
              </Button>
            </div>
          </div>
        ) : null}

        {state.editor === "prices" ? (
          <div className="space-y-5 p-6">
            <InlineDateScope
              label="What price would you like to change?"
              from={priceFrom}
              to={priceTo}
              onOpen={() => setRangePickerOpen(true)}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                  {priceScope === "DEFAULT" ? "Current default" : "Default price"}
                </p>
                <p className="mt-1 text-lg font-semibold">€95</p>
              </div>
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                <p className="text-[0.65rem] font-medium tracking-wide text-primary uppercase">
                  {priceScope === "DEFAULT" ? "New default" : "New custom price"}
                </p>
                <p className="mt-1 text-lg font-semibold">€{price || "0"}</p>
              </div>
            </div>

            <div>
              <Label htmlFor="nightly-price" className="mb-1.5 block text-sm font-semibold">
                Nightly price
              </Label>
              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  €
                </span>
                <Input
                  id="nightly-price"
                  type="number"
                  min={1}
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="h-11 pl-7 text-base font-semibold tabular-nums"
                />
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                  per night
                </span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Quick adjustments
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  {
                    label: "−10%",
                    value: formatAdjustedPrice(BASE_RATE * 0.9, roundPrice),
                  },
                  {
                    label: "Base",
                    value: formatAdjustedPrice(BASE_RATE, roundPrice),
                  },
                  {
                    label: "+20%",
                    value: formatAdjustedPrice(BASE_RATE * 1.2, roundPrice),
                  },
                  {
                    label: "+50%",
                    value: formatAdjustedPrice(BASE_RATE * 1.5, roundPrice),
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={price === preset.value}
                    onClick={() => setPrice(preset.value)}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                      price === preset.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:border-primary/35"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <RoundUpControl
              enabled={roundPrice}
              onToggle={() => {
                const next = !roundPrice;
                setRoundPrice(next);
                const numericPrice = Number(price);
                if (next && Number.isFinite(numericPrice)) {
                  setPrice(formatAdjustedPrice(numericPrice, true));
                }
              }}
            />

            <div className="flex gap-3 rounded-xl border bg-muted/25 p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {priceScope === "DEFAULT"
                  ? "Existing custom-priced dates remain unchanged. The new default applies everywhere else."
                  : "This custom price overrides the default only for the selected dates."}
              </p>
            </div>

            <div className="flex justify-between gap-2 border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() =>
                  save(
                    priceScope === "DEFAULT"
                      ? "Default price kept at €95"
                      : "Default price restored"
                  )
                }
              >
                <RotateCcw className="size-4" />
                {priceScope === "DEFAULT" ? "Keep current price" : "Use default price"}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onStateChange(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    save(
                      priceScope === "DEFAULT"
                        ? "Default price saved"
                        : "Custom price saved"
                    )
                  }
                >
                  {priceScope === "DEFAULT"
                    ? "Save default price"
                    : "Save custom price"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {state.editor === "promotions" ? (
          <div className="space-y-5 p-6">
            <InlineDateScope
              label="When should this promotion apply?"
              from={promotionFrom}
              to={promotionTo}
              onOpen={() => setRangePickerOpen(true)}
            />

            <fieldset>
              <legend className="text-sm font-semibold">Recommended offers</legend>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Start with a proven offer and customize it if needed.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { title: "Recommended", percent: 15, nights: 5 },
                  { title: "Long stay", percent: 20, nights: 10 },
                  { title: "Monthly", percent: 30, nights: 30 },
                ].map((offer) => {
                  const selected =
                    percent === String(offer.percent) &&
                    eligibility === "MINIMUM" &&
                    minimumNights === String(offer.nights);
                  return (
                    <button
                      key={offer.title}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setPercent(String(offer.percent));
                        setEligibility("MINIMUM");
                        setMinimumNights(String(offer.nights));
                      }}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:border-primary/35"
                      )}
                    >
                      <CalendarRange
                        className={cn(
                          "size-4",
                          selected ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <span className="mt-3 block text-xs font-semibold">
                        {offer.title}
                      </span>
                      <span className="mt-0.5 block text-[0.65rem] text-muted-foreground">
                        {offer.percent}% · {offer.nights}+ nights
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold">
                Which stays receive this offer?
              </legend>
              <div className="mt-2 space-y-2">
                <div
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    eligibility === "ALL"
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/35"
                  )}
                >
                  <button
                    type="button"
                    aria-label="All bookable stays"
                    aria-pressed={eligibility === "ALL"}
                    onClick={() => setEligibility("ALL")}
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border",
                      eligibility === "ALL"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    )}
                  >
                    {eligibility === "ALL" ? <Check className="size-3" /> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEligibility("ALL")}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block text-xs font-semibold">All bookable stays</span>
                    <span className="block text-[0.65rem] text-muted-foreground">
                      The normal 5-night listing minimum still applies.
                    </span>
                  </button>
                  {eligibility === "ALL" ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        aria-label="Discount percentage"
                        type="number"
                        min={0}
                        max={50}
                        value={percent}
                        onChange={(event) => setPercent(event.target.value)}
                        className="h-8 w-16 text-center text-xs font-semibold"
                      />
                      <span className="text-[0.65rem] text-muted-foreground">% off</span>
                    </div>
                  ) : null}
                </div>

                <div
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                    eligibility === "MINIMUM"
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/35"
                  )}
                >
                  <button
                    type="button"
                    aria-label="Only stays of at least this many nights"
                    aria-pressed={eligibility === "MINIMUM"}
                    onClick={() => setEligibility("MINIMUM")}
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border",
                      eligibility === "MINIMUM"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    )}
                  >
                    {eligibility === "MINIMUM" ? <Check className="size-3" /> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEligibility("MINIMUM")}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block text-xs font-semibold">Only longer stays</span>
                    <span className="block text-[0.65rem] text-muted-foreground">
                      Shorter stays keep the normal price.
                    </span>
                  </button>
                  {eligibility === "MINIMUM" ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Input
                          id="discount"
                          aria-label="Discount percentage"
                          type="number"
                          min={0}
                          max={50}
                          value={percent}
                          onChange={(event) => setPercent(event.target.value)}
                          className="h-8 w-14 text-center text-xs font-semibold"
                        />
                        <span className="text-[0.65rem] text-muted-foreground">% off</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          id="minimum-stay"
                          aria-label="Minimum stay"
                          type="number"
                          min={1}
                          max={365}
                          value={minimumNights}
                          onChange={(event) => setMinimumNights(event.target.value)}
                          className="h-8 w-14 text-center text-xs font-semibold"
                        />
                        <span className="text-[0.65rem] text-muted-foreground">
                          nights
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[0.68rem] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                If several offers qualify, the one with the highest minimum-stay
                requirement applies with its own discount and cleaning benefit.
                Date-specific offers take priority over always-active offers.
              </p>
            </fieldset>

            <button
              type="button"
              role="switch"
              aria-checked={freeCleaning}
              onClick={() => setFreeCleaning((current) => !current)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
                freeCleaning
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:border-primary/35 hover:bg-muted/30"
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg",
                  freeCleaning
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Sparkles className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">Add free cleaning</span>
                <span className="mt-0.5 block text-[0.65rem] text-muted-foreground">
                  Guests save the €50 cleaning fee on the same qualifying stays.
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                  freeCleaning ? "bg-primary" : "bg-muted-foreground/25"
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 size-4 rounded-full bg-background shadow-sm transition-transform",
                    freeCleaning ? "translate-x-5" : "translate-x-1"
                  )}
                />
              </span>
            </button>

            {hasDiscount ? (
              <RoundUpControl
                enabled={roundPromotion}
                onToggle={() => setRoundPromotion((current) => !current)}
              />
            ) : null}

            <div className="flex items-start gap-3 rounded-xl bg-primary/7 p-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                  Guests will see
                </p>
                <p className="mt-0.5 text-sm font-semibold">
                  {hasPromotion ? promotionBenefits : "No promotion selected"}
                  {hasPromotion && eligibility === "MINIMUM"
                    ? ` · ${minimumNights || "0"}+ nights`
                    : ""}
                </p>
                {hasDiscount ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Estimated guest price: €{promotionGuestPrice} / night
                    {roundPromotion
                      ? ` · rounded up from €${Number(rawPromotionPrice.toFixed(2))}`
                      : ""}
                  </p>
                ) : null}
                {freeCleaning ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Guests also save the €50 cleaning fee.
                  </p>
                ) : null}
                {!hasPromotion ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Add a discount, free cleaning, or both.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => onStateChange(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() =>
                  save(hasPromotion ? "Promotion saved" : "Promotion turned off")
                }
              >
                {hasPromotion ? "Save promotion" : "Turn off promotion"}
              </Button>
            </div>
          </div>
        ) : null}
        </DialogContent>
      </Dialog>
      {rangePickerOpen ? (
        <RangePickerDialog
          open
          value={pickerValue}
          title={pickerTitle}
          onOpenChange={setRangePickerOpen}
          onApply={applyPickerRange}
        />
      ) : null}
    </>
  );
}

export function CalendarLab() {
  const [scenario, setScenario] = useState<"populated" | "empty">("populated");
  const [visibleMonth, setVisibleMonth] = useState(INITIAL_MONTH);
  const [selection, setSelection] = useState<DateSelection | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<Date | null>(null);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>("all");
  const [filterFrom, setFilterFrom] = useState<Date | undefined>();
  const [filterTo, setFilterTo] = useState<Date | undefined>();

  const changes = scenario === "populated" ? POPULATED_CHANGES : [];
  const filteredChanges = changes.filter((change) => {
    if (changeFilter !== "all" && change.kind !== changeFilter) return false;
    if (filterFrom && isBefore(change.to, filterFrom)) return false;
    if (filterTo && isAfter(change.from, filterTo)) return false;
    return true;
  });

  const clearSelection = () => {
    setSelection(null);
    setSelectionAnchor(null);
  };

  const selectDate = (date: Date) => {
    if (!selectionAnchor || (selection && !isSameDay(selection.from, selection.to))) {
      setSelectionAnchor(date);
      setSelection({ from: date, to: date });
      return;
    }

    const from = isBefore(date, selectionAnchor) ? date : selectionAnchor;
    const to = isAfter(date, selectionAnchor) ? date : selectionAnchor;
    setSelection({ from, to });
    setSelectionAnchor(null);
  };

  const editChange = (change: ScheduledChange) => {
    setDrawer({
      editor: editorForChange(change.kind),
      range:
        change.promotion?.scope === "always"
          ? null
          : { from: change.from, to: change.to },
      promotion: change.promotion,
    });
  };

  const mockQuickAction = (change: ScheduledChange) => {
    const message =
      change.kind === "block"
        ? "Dates would be opened"
        : change.kind === "price"
          ? "Price would reset to €95"
          : "Promotion would be removed";
    toast.success(message, {
      description: `${
        change.promotion?.scope === "always"
          ? "Always active"
          : formatRange(change.from, change.to)
      } · mockup only`,
    });
  };

  const changeScenario = (next: "populated" | "empty") => {
    setScenario(next);
    setVisibleMonth(INITIAL_MONTH);
    clearSelection();
    setDrawer(null);
    setChangeFilter("all");
    setFilterFrom(undefined);
    setFilterTo(undefined);
  };

  return (
    <div className="min-h-screen bg-[#faf9f7] text-foreground">
      <div className="border-b bg-background/80 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            UI lab
          </span>
          <div className="flex gap-1">
            {(["populated", "empty"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeScenario(item)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition-colors",
                  scenario === item
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {item === "populated" ? "Populated" : "Empty listing"}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            Fixture data · safe to click around
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <header className="mb-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Cozy 2BR Garden Apartment in Nea Flogita · €95/night · min 5 nights
          </p>
        </header>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-5 py-3">
            <div>
              <p className="text-sm font-medium">
                {selectionAnchor
                  ? "Choose the end date"
                  : "Select one date or a date range"}
              </p>
              <p className="text-xs text-muted-foreground">
                Select dates for a quick override, or use the actions below for
                listing-wide settings.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 rounded-full"
                onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8 rounded-full"
                onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-8 p-4 sm:p-6 md:grid-cols-2 md:gap-9">
            <MonthGrid
              month={visibleMonth}
              changes={changes}
              selection={selection}
              onSelect={selectDate}
            />
            <MonthGrid
              month={addMonths(visibleMonth, 1)}
              changes={changes}
              selection={selection}
              onSelect={selectDate}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-5 py-3 text-[0.68rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-rose-200" />
              Booked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-stone-300" />
              Blocked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" />
              Promotion
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="font-semibold text-primary">€160</span>
              Custom price
            </span>
          </div>

          <div className="relative flex flex-col items-center gap-3 border-t bg-stone-50 px-5 py-4 text-center">
            <div>
              <p className="text-sm font-semibold">
                {selection
                  ? "Edit selected dates"
                  : "Manage your listing or select dates"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selection ? (
                  <>
                    {formatRange(selection.from, selection.to, true)} ·{" "}
                    {
                      eachDayOfInterval({
                        start: selection.from,
                        end: selection.to,
                      }).length
                    }{" "}
                    {isSameDay(selection.from, selection.to) ? "night" : "nights"}
                  </>
                ) : (
                  "Change listing visibility, default pricing, or create an always-active promotion."
                )}
              </p>
            </div>

            <div className="flex w-full max-w-2xl flex-col justify-center gap-2 sm:flex-row">
              {(
                [
                  {
                    editor: "availability",
                    label: selection ? "Availability" : "Listing availability",
                    detail: selection ? "Open or block dates" : "Show or hide listing",
                    icon: LockKeyhole,
                  },
                  {
                    editor: "prices",
                    label: selection ? "Custom price" : "Default price",
                    detail: selection ? "Price selected dates" : `Currently €${BASE_RATE}`,
                    icon: CircleDollarSign,
                  },
                  {
                    editor: "promotions",
                    label: selection ? "Promotion" : "Create promotion",
                    detail: selection ? "Promote selected dates" : "Always active or dated",
                    icon: BadgePercent,
                  },
                ] as const
              ).map(({ editor, label, detail, icon: Icon }) => (
                  <button
                    key={editor}
                    type="button"
                    onClick={() => setDrawer({ editor, range: selection })}
                    className="group flex flex-1 items-center gap-3 rounded-xl border bg-background px-3 py-2.5 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <span className="block text-xs font-semibold">{label}</span>
                      <span className="block text-[0.65rem] text-muted-foreground">
                        {detail}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
            {selection ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 text-muted-foreground"
                onClick={clearSelection}
              >
                <X className="size-4" />
                Clear
              </Button>
            ) : null}
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-5 py-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Scheduled changes</h2>
                <p className="text-xs text-muted-foreground">
                  Everything important is visible here; actions stay specific to each change.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {filteredChanges.length} shown
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-1.5" aria-label="Change type filters">
                {CHANGE_FILTERS.map((filter) => {
                  const count =
                    filter.value === "all"
                      ? changes.length
                      : changes.filter((change) => change.kind === filter.value).length;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      aria-pressed={changeFilter === filter.value}
                      onClick={() => setChangeFilter(filter.value)}
                      onDoubleClick={() => setChangeFilter("all")}
                      title="Double-click to clear this filter"
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        changeFilter === filter.value
                          ? "border-foreground bg-foreground text-background"
                          : "bg-background text-muted-foreground hover:border-foreground/25"
                      )}
                    >
                      {filter.label} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                <DateFilterField
                  label="From"
                  value={filterFrom}
                  onChange={setFilterFrom}
                  disabled={filterTo ? (date) => isAfter(date, filterTo) : undefined}
                />
                <DateFilterField
                  label="To"
                  value={filterTo}
                  onChange={setFilterTo}
                  disabled={filterFrom ? (date) => isBefore(date, filterFrom) : undefined}
                />
                {filterFrom || filterTo || changeFilter !== "all" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => {
                      setChangeFilter("all");
                      setFilterFrom(undefined);
                      setFilterTo(undefined);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {filteredChanges.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium">
                {changes.length === 0 ? "No scheduled changes" : "Nothing matches these filters"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {changes.length === 0
                  ? "Select dates above to explore the editing workflow."
                  : "Adjust the type or date filters to see more items."}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredChanges.map((change) => {
                const changeRangeLabel =
                  change.promotion?.scope === "always"
                    ? "Always active"
                    : formatRange(change.from, change.to);
                const Icon =
                  change.kind === "price"
                    ? CircleDollarSign
                    : change.kind === "promotion"
                      ? BadgePercent
                      : change.kind === "booking"
                        ? BedDouble
                        : LockKeyhole;
                const typeLabel =
                  change.kind === "booking"
                    ? "Reservation"
                    : change.kind === "block"
                      ? "Availability"
                      : change.kind === "price"
                        ? "Price override"
                        : "Promotion";

                return (
                  <div
                    key={change.id}
                    data-testid={`change-row-${change.id}`}
                    className="grid gap-3 px-5 py-3.5 sm:grid-cols-[8rem_8rem_minmax(0,1fr)_13rem] sm:items-center"
                  >
                    <span className="text-sm font-medium tabular-nums">
                      {changeRangeLabel}
                    </span>
                    <span
                      className={cn(
                        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-medium",
                        change.kind === "booking" && "bg-rose-100 text-rose-800",
                        change.kind === "block" && "bg-stone-200 text-stone-700",
                        change.kind === "price" && "bg-primary/10 text-primary",
                        change.kind === "promotion" && "bg-amber-100 text-amber-800"
                      )}
                    >
                      <Icon className="size-3.5" />
                      {typeLabel}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{change.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {change.detail} · {change.source}
                      </span>
                    </span>
                    {change.kind === "booking" ? (
                      <span className="text-right text-xs text-muted-foreground">
                        Protected reservation
                      </span>
                    ) : (
                      <span className="flex items-center justify-start gap-1 whitespace-nowrap sm:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          aria-label={`Edit ${typeLabel.toLowerCase()} ${changeRangeLabel}`}
                          onClick={() => editChange(change)}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground"
                          aria-label={`${
                            change.kind === "block"
                              ? "Make available"
                              : change.kind === "price"
                                ? "Reset price"
                                : "Remove promotion"
                          } ${changeRangeLabel}`}
                          onClick={() => mockQuickAction(change)}
                        >
                          {change.kind === "block" ? (
                            <UnlockKeyhole className="size-3.5" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          {change.kind === "block"
                            ? "Make available"
                            : change.kind === "price"
                              ? "Reset price"
                              : "Remove offer"}
                        </Button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <EditorDialog
        key={
          drawer
            ? `${drawer.editor}-${drawer.range?.from.getTime() ?? "always"}-${
                drawer.range?.to.getTime() ?? "always"
              }-${drawer.promotion?.minimumNights ?? "new"}`
            : "closed"
        }
        state={drawer}
        onStateChange={setDrawer}
      />
    </div>
  );
}
