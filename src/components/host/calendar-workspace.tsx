"use client";

import { eachDayOfInterval, format, isAfter, isBefore } from "date-fns";
import {
  ArrowRight,
  BadgePercent,
  BedDouble,
  CalendarDays,
  CalendarRange,
  Check,
  CircleDollarSign,
  Eye,
  EyeOff,
  LockKeyhole,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { DateRangeCalendarStep } from "@/components/marketplace/marketplace-stay-date-picker";
import { ListingActionBarPortal } from "@/components/host/listing-action-bar-portal";
import {
  OFFER_PREVIEW_NOTE,
  OfferPreview,
  OptionToggle,
  STICKY_FOOTER,
} from "@/components/host/calendar-editor-ui";
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
import { Tx, interpolate, translatedClass, useI18n } from "@/lib/i18n/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  blockCalendarRange,
  clearCalendarDatePrice,
  hideListingFromCalendar,
  publishListingFromCalendar,
  openCalendarRange,
  removeCalendarPromotion,
  saveCalendarDefaultPricing,
  saveCalendarPromotion,
  setCalendarDatePrice,
} from "@/lib/actions/calendar.actions";
import { cn } from "@/lib/utils";
import {
  addDaysToYmd,
  dbDateToYmd,
  eachYmdExclusive,
} from "@/lib/utils/date-only";
import { dateKey, parseLocalYmd } from "@/lib/utils/stay-pricing";

export interface WorkspaceBlock {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  blockType: string;
  reason?: string | null;
  booking?: {
    id: string;
    guest: { name: string };
    status: string;
  } | null;
}

export interface WorkspaceDatePrice {
  id: string;
  date: Date | string;
  nightlyRate: number;
}

export interface WorkspacePromotion {
  id: string;
  type: "PERCENT_DISCOUNT" | "FREE_CLEANING";
  discountPercent: number;
  minimumNights: number | null;
  freeCleaning: boolean;
  roundToWholeUnit: boolean;
  startDate: Date | string | null;
  endDate: Date | string | null;
  createdAt: Date | string;
}

/**
 * The three host calendar screens are one grid seen through three lenses. Splitting
 * them into separate components would mean three date grids to keep in sync, so the
 * lens only changes what a day cell says, which legend is shown, which action the
 * footer offers, and which scheduled changes are listed.
 */
export type CalendarLens = "availability" | "pricing" | "promotions";

export interface CalendarWorkspaceProps {
  listingId: string;
  listingTitle: string;
  listingStatus: string;
  lens: CalendarLens;
  locale: string;
  currency: string;
  baseNightlyRate: number;
  cleaningFee: number;
  minNights: number;
  datePrices: WorkspaceDatePrice[];
  blocks: WorkspaceBlock[];
  promotions: WorkspacePromotion[];
  /**
   * Dates the host selected on another lens, carried over in the URL. The common task
   * is "these dates are peak" — block a couple, reprice the rest, discount the week —
   * so losing the selection on every lens switch would make the split worse than the
   * single crowded screen it replaced.
   */
  initialFrom?: string;
  initialTo?: string;
}

type EditorKind = "availability" | "price" | "promotion";
type ChangeKind = "booking" | "block" | "price" | "promotion";
type ChangeFilter = "all" | ChangeKind;

type EditorState = {
  kind: EditorKind;
  range?: DateRange | null;
  promotion?: WorkspacePromotion;
  initialPrice?: number;
};

type ScheduledChange = {
  id: string;
  kind: ChangeKind;
  from?: string;
  to?: string;
  label: string;
  detail: string;
  source: string;
  promotion?: WorkspacePromotion;
  nightlyRate?: number;
};

const FILTERS: { value: ChangeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "block", label: "Blocks" },
  { value: "price", label: "Prices" },
  { value: "promotion", label: "Promotions" },
  { value: "booking", label: "Reservations" },
];

const LENS_META: Record<
  CalendarLens,
  {
    heading: string;
    segment: string;
    editorKind: EditorKind;
    changeKinds: ChangeKind[];
    changesTitle: string;
    changesDescription: string;
    emptyLabel: string;
    /** Shown in the action bar before any dates are picked — on a phone this is
     *  the only instruction the screen gives. */
    emptyHint: string;
  }
> = {
  availability: {
    heading: "Availability",
    segment: "availability",
    editorKind: "availability",
    changeKinds: ["block", "booking"],
    changesTitle: "Blocked dates and reservations",
    changesDescription: "Dates guests cannot book, and why.",
    emptyLabel: "Every upcoming date is open for booking.",
    emptyHint: "Tap or drag across dates to block them.",
  },
  pricing: {
    heading: "Pricing",
    segment: "pricing",
    editorKind: "price",
    changeKinds: ["price"],
    changesTitle: "Custom prices",
    changesDescription: "Dates priced differently from the base rate.",
    emptyLabel: "Every date uses the base nightly rate.",
    emptyHint: "Tap or drag across dates to price them.",
  },
  promotions: {
    heading: "Promotions",
    segment: "promotion",
    editorKind: "promotion",
    changeKinds: ["promotion"],
    changesTitle: "Active promotions",
    changesDescription: "Always-active and date-specific discounts.",
    emptyLabel: "No promotions are running.",
    emptyHint: "Tap or drag across dates to discount them.",
  },
};

/** Days a dated promotion covers, mapped to the shortest badge that fits a cell. */
function promotionLabelByDate(promotions: WorkspacePromotion[]) {
  // Rank, not label, decides which promotion a day shows: a cell has room for one
  // badge and the biggest discount is the one worth surfacing. Free cleaning ranks
  // above "no benefit" but below any percentage.
  const best = new Map<string, { rank: number; label: string }>();
  for (const promotion of promotions) {
    if (!promotion.startDate || !promotion.endDate) continue;
    const rank =
      promotion.discountPercent > 0
        ? promotion.discountPercent
        : promotion.freeCleaning
          ? 0.5
          : 0;
    const label =
      promotion.discountPercent > 0
        ? `-${promotion.discountPercent}%`
        : promotion.freeCleaning
          ? "free"
          : "promo";
    for (const day of eachYmdExclusive(
      dbDateToYmd(promotion.startDate),
      dbDateToYmd(promotion.endDate),
    )) {
      const existing = best.get(day);
      if (!existing || rank > existing.rank) best.set(day, { rank, label });
    }
  }
  return new Map([...best].map(([day, value]) => [day, value.label]));
}

function rangeLabel(from: string, to: string, includeYear = false) {
  const start = parseLocalYmd(from);
  const end = parseLocalYmd(to);
  if (from === to) return format(start, includeYear ? "MMM d, yyyy" : "MMM d");
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, "MMM d")}–${format(
      end,
      includeYear ? "d, yyyy" : "d",
    )}`;
  }
  return `${format(start, "MMM d")}–${format(
    end,
    includeYear ? "MMM d, yyyy" : "MMM d",
  )}`;
}

function calendarRangeToInput(range: DateRange) {
  const from = range.from!;
  const to = range.to ?? range.from!;
  const startDate = dateKey(from);
  const lastDate = dateKey(to);
  return {
    startDate,
    lastDate,
    endDate: addDaysToYmd(lastDate, 1),
    nights: eachDayOfInterval({ start: from, end: to }).length,
  };
}

/**
 * How much of a selection is already unavailable, and why. Drives which of the
 * two availability actions is offered: only manual blocks can be opened, and
 * there is nothing left to block once every night is blocked or booked.
 */
function countSelectionNights(
  input: { startDate: string; endDate: string },
  blockedDates: Set<string>,
  bookedDates: Set<string>,
) {
  let blocked = 0;
  let booked = 0;
  let nights = 0;
  for (const day of eachYmdExclusive(input.startDate, input.endDate)) {
    nights += 1;
    // A booking wins the label: it is the reason the night cannot be opened.
    if (bookedDates.has(day)) booked += 1;
    else if (blockedDates.has(day)) blocked += 1;
  }
  return { nights, blocked, booked, open: nights - blocked - booked };
}

function selectionSummary({
  nights,
  blocked,
  booked,
}: {
  nights: number;
  blocked: number;
  booked: number;
}) {
  const label = `${nights} ${nights === 1 ? "night" : "nights"} selected`;
  if (blocked === 0 && booked === 0) {
    return `${label}, all open. Blocking stops new booking requests.`;
  }
  const parts = [
    blocked > 0 ? `${blocked} blocked` : null,
    booked > 0 ? `${booked} booked` : null,
  ].filter(Boolean);
  if (blocked + booked === nights) {
    return `${label}, all unavailable (${parts.join(", ")}).`;
  }
  return `${label}, ${parts.join(" and ")}. Blocking leaves bookings untouched.`;
}

function dbPromotionRange(
  promotion: WorkspacePromotion,
): DateRange | undefined {
  if (!promotion.startDate || !promotion.endDate) return undefined;
  const from = parseLocalYmd(dbDateToYmd(promotion.startDate));
  const lastDate = addDaysToYmd(dbDateToYmd(promotion.endDate), -1);
  return { from, to: parseLocalYmd(lastDate) };
}

function RangePickerDialog({
  open,
  value,
  title,
  locale,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  value?: DateRange;
  title: string;
  locale: string;
  onOpenChange: (open: boolean) => void;
  onApply: (range?: DateRange) => void;
}) {
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  const normalized = draft?.from
    ? { from: draft.from, to: draft.to ?? draft.from }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet" className="gap-0 overflow-hidden p-0 md:max-h-[92vh] md:max-w-[52rem]">
        <DialogHeader>
          <div className="border-b px-6 py-5 pr-12 text-left">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1">
              <Tx
                k="host.calendar.range_hint"
                source="Select one date or drag across a date range."
              />
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <DateRangeCalendarStep
            active={open}
            fitViewport
            selected={draft}
            onRangeChange={setDraft}
            dayVariant="availability"
            dragToSelect
            locale={locale}
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              onApply(undefined);
              onOpenChange(false);
            }}
          >
            <Tx k="host.calendar.clear_dates" source="Clear dates" />
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              <Tx k="host.calendar.cancel" source="Cancel" />
            </Button>
            <Button
              type="button"
              disabled={!normalized}
              onClick={() => {
                onApply(normalized);
                onOpenChange(false);
              }}
            >
              <Tx k="host.calendar.use_dates" source="Use selected dates" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: Date;
  onChange: (date?: Date) => void;
}) {
  const { resolve } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 min-w-32 items-center gap-2 rounded-lg border bg-background px-3 text-left"
        >
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <span>
            <span className="block text-[0.7rem] md:text-[0.55rem] font-semibold tracking-wide text-muted-foreground uppercase">
              {label}
            </span>
            <span className="block text-sm md:text-xs font-medium">
              {value ? format(value, "MMM d, yyyy") : "Any date"}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <MiniCalendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
        {value ? (
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-sm md:text-xs"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              {
                interpolate(resolve("host.calendar.clear_field", "Clear {field}"), {
                  field: label.toLowerCase(),
                }).text
              }
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function EditorDialog({
  listingId,
  listingStatus,
  baseNightlyRate,
  cleaningFee,
  minNights,
  locale,
  blockedDates,
  bookedDates,
  state,
  onStateChange,
  onClose,
}: {
  listingId: string;
  listingStatus: string;
  baseNightlyRate: number;
  cleaningFee: number;
  minNights: number;
  locale: string;
  blockedDates: Set<string>;
  bookedDates: Set<string>;
  state: EditorState;
  onStateChange: (state: EditorState) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const i18n = useI18n();
  const { resolve } = i18n;
  const resolveReviewed = i18n.resolve;
  const [pending, startTransition] = useTransition();
  const [range, setRange] = useState<DateRange | undefined>(
    state.range === null
      ? undefined
      : (state.range ??
          (state.promotion ? dbPromotionRange(state.promotion) : undefined)),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [visibility, setVisibility] = useState<"visible" | "hidden">(
    listingStatus === "APPROVED" ? "visible" : "hidden",
  );
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState(
    String(state.initialPrice ?? baseNightlyRate),
  );
  const [fee, setFee] = useState(String(cleaningFee));
  const [minimumStay, setMinimumStay] = useState(String(minNights));
  const [roundPrice, setRoundPrice] = useState(true);
  const [discount, setDiscount] = useState(
    String(state.promotion?.discountPercent ?? 15),
  );
  const [promotionMinimum, setPromotionMinimum] = useState(
    String(state.promotion?.minimumNights ?? Math.max(5, minNights)),
  );
  const [freeCleaning, setFreeCleaning] = useState(
    state.promotion?.freeCleaning ?? false,
  );
  const [roundPromotion, setRoundPromotion] = useState(
    state.promotion?.roundToWholeUnit ?? true,
  );

  const isDateScoped = Boolean(range?.from);
  const selectedInput = range?.from ? calendarRangeToInput(range) : null;
  const editorMeta =
    state.kind === "availability"
      ? {
          title: "Manage availability",
          description: "Control listing visibility or calendar dates.",
          icon: LockKeyhole,
          pickerTitle: "Select availability dates",
        }
      : state.kind === "price"
        ? {
            title: "Manage pricing",
            description: "Change the default rate or price specific dates.",
            icon: CircleDollarSign,
            pickerTitle: "Select pricing dates",
          }
        : {
            title: state.promotion ? "Edit promotion" : "Create a promotion",
            description: "Set the stay threshold, benefits, and date scope.",
            icon: BadgePercent,
            pickerTitle: "Select promotion dates",
          };
  const HeaderIcon = editorMeta.icon;

  function report(
    action: () => Promise<{ success?: string; error?: string } | undefined>,
    fallback: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result?.success ?? fallback);
      onClose();
      router.refresh();
    });
  }

  function saveAvailability(intent: "available" | "blocked") {
    if (!selectedInput) {
      const isPublished = listingStatus === "APPROVED";
      if (visibility === "visible") {
        if (isPublished) {
          toast.success("Listing remains visible.");
          onClose();
          return;
        }
        report(
          () => publishListingFromCalendar(listingId),
          "Listing is live on the site.",
        );
        return;
      }
      if (!isPublished) {
        toast.success("Listing is already hidden.");
        onClose();
        return;
      }
      report(() => hideListingFromCalendar(listingId), "Listing hidden.");
      return;
    }
    if (intent === "blocked") {
      report(
        () =>
          blockCalendarRange(listingId, {
            startDate: selectedInput.startDate,
            endDate: selectedInput.endDate,
            reason: reason.trim() || undefined,
          }),
        "Dates blocked.",
      );
      return;
    }
    report(
      () =>
        openCalendarRange(listingId, {
          startDate: selectedInput.startDate,
          endDate: selectedInput.endDate,
        }),
      "Dates made available.",
    );
  }

  function savePrice() {
    const nightlyRate = Number(price);
    if (!Number.isFinite(nightlyRate) || nightlyRate <= 0) {
      toast.error("Enter a valid nightly price.");
      return;
    }
    if (selectedInput) {
      report(
        () =>
          setCalendarDatePrice(listingId, {
            startDate: selectedInput.startDate,
            endDate: selectedInput.endDate,
            nightlyRate,
          }),
        "Custom price saved.",
      );
      return;
    }

    const cleaning = Number(fee);
    const nights = Number(minimumStay);
    if (!Number.isFinite(cleaning) || cleaning < 0) {
      toast.error("Enter a valid cleaning fee.");
      return;
    }
    if (!Number.isInteger(nights) || nights < 1) {
      toast.error("Enter a valid minimum stay.");
      return;
    }
    report(
      () =>
        saveCalendarDefaultPricing(listingId, {
          baseNightlyRate: nightlyRate,
          cleaningFee: cleaning,
          minNights: nights,
        }),
      "Default pricing saved.",
    );
  }

  function savePromotion() {
    const discountPercent = Number(discount);
    const promotionNights = Number(promotionMinimum);
    if (
      !Number.isInteger(discountPercent) ||
      discountPercent < 0 ||
      discountPercent > 50
    ) {
      toast.error("Choose a discount between 0% and 50%.");
      return;
    }
    if (!Number.isInteger(promotionNights) || promotionNights < 1) {
      toast.error("Enter a valid minimum stay.");
      return;
    }
    if (discountPercent === 0 && !freeCleaning) {
      toast.error("Add a discount, free cleaning, or both.");
      return;
    }
    report(
      () =>
        saveCalendarPromotion(listingId, {
          promotionId: state.promotion?.id,
          discountPercent,
          minimumNights: promotionNights,
          freeCleaning,
          roundToWholeUnit: discountPercent > 0 && roundPromotion,
          startDate: selectedInput?.startDate,
          endDate: selectedInput?.endDate,
        }),
      state.promotion ? "Promotion updated." : "Promotion created.",
    );
  }

  const currentRangeText = selectedInput
    ? `${rangeLabel(selectedInput.startDate, selectedInput.lastDate, true)} · ${
        selectedInput.nights
      } ${selectedInput.nights === 1 ? "night" : "nights"}`
    : state.kind === "availability"
      ? "Listing visibility"
      : state.kind === "price"
        ? `Default nightly price · €${baseNightlyRate}`
        : "Always active · no end date";

  /** The action the footer's primary button would run, for the Enter key. */
  function submitEditor() {
    if (state.kind === "price") {
      savePrice();
      return;
    }
    if (state.kind === "promotion") {
      savePromotion();
      return;
    }
    if (!isDateScoped) {
      saveAvailability(visibility === "hidden" ? "blocked" : "available");
      return;
    }
    if (selectionCounts.open === 0) return;
    saveAvailability("blocked");
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (pickerOpen || pending) return;
    // Buttons and links already act on Enter, and a textarea needs it for newlines.
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, textarea, [role='button']")) return;
    event.preventDefault();
    submitEditor();
  }

  const numericDiscount = Math.min(50, Math.max(0, Number(discount) || 0));
  const rawGuestRate = baseNightlyRate * (1 - numericDiscount / 100);
  // Mirrors computeStayQuote: nearest whole currency unit, never above the rate.
  const guestRate = roundPromotion
    ? Math.min(baseNightlyRate, Math.round(rawGuestRate))
    : Number(rawGuestRate.toFixed(2));
  // The short verb key, not `block_selected`: its reviewed translations read
  // "Block selected range", which does not fit a half-width button.
  const blockCta = resolveReviewed("mobile.calendar.block", "Block dates");
  const openCta = resolveReviewed(
    "mobile.calendar.make_available",
    "Make available",
  );
  const visibilityCta =
    visibility === "hidden"
      ? resolveReviewed("mobile.listings.hide_site", "Hide from site")
      : resolveReviewed("mobile.calendar.make_available", "Make available");
  const selectionCounts = selectedInput
    ? countSelectionNights(selectedInput, blockedDates, bookedDates)
    : { nights: 0, blocked: 0, booked: 0, open: 0 };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !pickerOpen) onClose();
        }}
      >
        <DialogContent
          variant="sheet"
          onKeyDown={handleEditorKeyDown}
          className="flex flex-col gap-0 overflow-hidden p-0 md:h-auto md:max-h-[90dvh] md:max-w-[34rem]"
        >
          {/* Two single lines, not two stacked blocks: on a phone the header used
              three rows and the scope row below repeated the dates a third time,
              which pushed the actual controls under the fold. */}
          <DialogHeader className="shrink-0">
            <div className="flex min-w-0 items-center gap-2.5 border-b px-6 py-3.5 pr-12 text-left">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <HeaderIcon className="size-4" />
              </span>
              <DialogTitle className="min-w-0 truncate text-base leading-snug">
                {editorMeta.title}
              </DialogTitle>
              {/* Radix needs a description; the body says the same thing louder. */}
              <DialogDescription className="sr-only">
                {editorMeta.description}
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/25 px-6 py-2.5 text-sm md:text-xs font-medium">
            <span className="flex min-w-0 items-center gap-2">
              <CalendarRange className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{currentRangeText}</span>
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="shrink-0 font-semibold text-primary transition-colors hover:text-primary/75"
            >
              {isDateScoped ? "Change" : "Select dates"}
            </button>
          </div>

          <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {state.kind === "availability" ? (
            <div className="space-y-4 p-6">
              {!isDateScoped ? (
                <>
                  <fieldset>
                    <legend className="text-sm font-semibold">
                      <Tx k="host.calendar.visibility" source="Listing visibility" />
                    </legend>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {(
                        [
                          {
                            value: "visible",
                            label: "Visible",
                            description:
                              "Guests can find and request this listing",
                            icon: Eye,
                          },
                          {
                            value: "hidden",
                            label: "Hidden from site",
                            description: "Stop new booking requests",
                            icon: EyeOff,
                          },
                        ] as const
                      ).map((option) => {
                        const selected = visibility === option.value;
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setVisibility(option.value)}
                            className={cn(
                              "relative rounded-xl border p-4 text-left",
                              selected
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "hover:border-primary/35",
                            )}
                          >
                            <Icon className="size-5 text-primary" />
                            <span className="mt-4 block text-sm font-semibold">
                              {option.label}
                            </span>
                            <span className="mt-1 block text-sm md:text-xs text-muted-foreground">
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
                  <div className="flex gap-3 rounded-xl border bg-muted/25 p-3">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                    <p className="text-sm md:text-xs text-muted-foreground">
                      <Tx
                        k="host.calendar.visibility_note"
                        source="Existing reservations remain protected. A hidden listing must be submitted for review again before guests can book it."
                      />
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* Picking a state and then confirming it made two steps out of
                      one. The two buttons below are the choice, so this only has
                      to say where the dates stand and what a block would change. */}
                  <p className="text-sm font-medium">
                    {selectionSummary(selectionCounts)}
                  </p>
                  <div>
                    <Label htmlFor="block-reason">
                      <Tx
                        k="host.calendar.block_reason"
                        source="Block reason (optional)"
                      />
                    </Label>
                    <Input
                      id="block-reason"
                      className="mt-1.5"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={
                        resolve(
                          "host.calendar.block_reason_placeholder",
                          "e.g. Maintenance or private stay",
                        ).text
                      }
                    />
                    <p className="mt-1.5 text-sm md:text-xs text-muted-foreground">
                      <Tx
                        k="host.calendar.block_reason_hint"
                        source="Only saved when you block. Guests never see it."
                      />
                    </p>
                  </div>
                </>
              )}
              {isDateScoped ? (
                <div className={cn(STICKY_FOOTER, "flex items-stretch gap-2")}>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={pending || selectionCounts.blocked === 0}
                    onClick={() => saveAvailability("available")}
                  >
                    <BedDouble className="size-4" />
                    <span className={translatedClass(openCta)}>
                      {openCta.text}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={pending || selectionCounts.open === 0}
                    onClick={() => saveAvailability("blocked")}
                  >
                    <LockKeyhole className="size-4" />
                    <span className={translatedClass(blockCta)}>
                      {blockCta.text}
                    </span>
                  </Button>
                </div>
              ) : (
                <div className={cn(STICKY_FOOTER, "flex justify-end gap-2")}>
                  <Button type="button" variant="outline" onClick={onClose}>
                    <Tx k="host.calendar.cancel" source="Cancel" />
                  </Button>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      saveAvailability(
                        visibility === "hidden" ? "blocked" : "available",
                      )
                    }
                  >
                    <span className={translatedClass(visibilityCta)}>
                      {visibilityCta.text}
                    </span>
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {state.kind === "price" ? (
            <div className="space-y-4 p-6">
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.035] p-4 shadow-sm">
                <Label
                  htmlFor="nightly-price"
                  className="text-sm font-semibold"
                >
                  {isDateScoped
                    ? "New custom nightly price"
                    : "New default nightly price"}
                </Label>
                <div className="relative mt-2">
                  <span
                    className="notranslate pointer-events-none absolute inset-y-0 left-4 flex items-center text-xl font-semibold text-muted-foreground"
                    translate="no"
                  >
                    €
                  </span>
                  <Input
                    id="nightly-price"
                    className="h-14 rounded-xl border-primary/25 bg-background pr-24 pl-10 text-2xl font-semibold shadow-xs"
                    type="number"
                    min={1}
                    step="0.01"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm md:text-xs text-muted-foreground">
                    <Tx k="host.calendar.per_night" source="per night" />
                  </span>
                </div>
                <p className="mt-2 text-sm md:text-xs text-muted-foreground">
                  <Tx
                    k="host.calendar.price_hint"
                    source="Enter an exact amount or choose a quick adjustment below."
                  />
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  ["−10%", baseNightlyRate * 0.9],
                  ["Base", baseNightlyRate],
                  ["+20%", baseNightlyRate * 1.2],
                  ["+50%", baseNightlyRate * 1.5],
                ].map(([label, value]) => {
                  const adjusted = roundPrice
                    ? Math.ceil(Number(value) / 5) * 5
                    : Number(Number(value).toFixed(2));
                  const selected = Number(price) === adjusted;
                  return (
                    <button
                      key={String(label)}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPrice(String(adjusted))}
                      className={cn(
                        "relative flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                          : "bg-background hover:border-primary/35 hover:bg-muted/30",
                      )}
                    >
                      <span className="text-sm md:text-xs font-semibold">{label}</span>
                      <span
                        translate="no"
                        className={cn(
                          "notranslate mt-0.5 text-xs md:text-[0.65rem]",
                          selected ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        €{adjusted}
                      </span>
                      {selected ? (
                        <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-2.5" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <OptionToggle
                checked={roundPrice}
                label="Round up to the nearest €5"
                description="Keeps guest-facing prices clean and easy to scan."
                onChange={() =>
                  setRoundPrice((current) => {
                    const next = !current;
                    if (next) {
                      const currentPrice = Number(price);
                      if (Number.isFinite(currentPrice) && currentPrice > 0) {
                        setPrice(String(Math.ceil(currentPrice / 5) * 5));
                      }
                    }
                    return next;
                  })
                }
              />
              {!isDateScoped ? (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm md:text-xs font-semibold text-muted-foreground">
                    <Tx
                      k="host.calendar.additional_defaults"
                      source="Additional default settings"
                    />
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cleaning-fee">
                        <Tx k="host.calendar.cleaning_fee" source="Cleaning fee" />
                      </Label>
                      <Input
                        id="cleaning-fee"
                        className="mt-1.5 bg-background"
                        type="number"
                        min={0}
                        value={fee}
                        onChange={(event) => setFee(event.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="minimum-stay">
                        <Tx k="host.calendar.minimum_nights" source="Minimum nights" />
                      </Label>
                      <Input
                        id="minimum-stay"
                        className="mt-1.5 bg-background"
                        type="number"
                        min={1}
                        value={minimumStay}
                        onChange={(event) => setMinimumStay(event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="flex gap-3 px-1">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                <p className="text-sm md:text-xs text-muted-foreground">
                  {isDateScoped
                    ? "This custom price overrides the default only for the selected dates."
                    : "Existing custom-priced dates remain unchanged. The new default applies everywhere else."}
                </p>
              </div>
              <div className={STICKY_FOOTER}>
                <div className="mb-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm md:text-xs">
                  <span className="min-w-0 break-words text-muted-foreground">
                    {isDateScoped ? "Default" : "Current default"}{" "}
                    <strong
                      className="notranslate whitespace-nowrap text-foreground"
                      translate="no"
                    >
                      €{baseNightlyRate}
                    </strong>
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span className="min-w-0 break-words text-primary">
                    {isDateScoped ? "Custom price" : "New default"}{" "}
                    <strong className="notranslate whitespace-nowrap" translate="no">
                      €{price || "0"}
                    </strong>
                  </span>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-8 whitespace-normal"
                    onClick={onClose}
                  >
                    <Tx k="host.calendar.cancel" source="Cancel" />
                  </Button>
                  <Button
                    type="button"
                    className="h-auto min-h-8 whitespace-normal"
                    disabled={pending}
                    onClick={savePrice}
                  >
                    {isDateScoped
                      ? "Save custom price"
                      : "Save default pricing"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {state.kind === "promotion" ? (
            <div className="space-y-4 p-6">
              <fieldset>
                <legend className="text-sm font-semibold">
                  <Tx k="host.calendar.recommended_offers" source="Recommended offers" />
                </legend>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { title: "Recommended", percent: 15, nights: 5 },
                    { title: "Long stay", percent: 20, nights: 10 },
                    { title: "Monthly", percent: 30, nights: 30 },
                  ].map((offer) => (
                    <button
                      key={offer.title}
                      type="button"
                      aria-pressed={
                        discount === String(offer.percent) &&
                        promotionMinimum === String(offer.nights)
                      }
                      onClick={() => {
                        setDiscount(String(offer.percent));
                        setPromotionMinimum(String(offer.nights));
                      }}
                      className="rounded-xl border p-3 text-left hover:border-primary/35 aria-pressed:border-primary aria-pressed:bg-primary/5"
                    >
                      <span className="block text-sm md:text-xs font-semibold">
                        {offer.title}
                      </span>
                      <span className="text-xs md:text-[0.65rem] text-muted-foreground">
                        {
                          interpolate(
                            resolve(
                              "host.calendar.offer_summary",
                              "{percent}% · {nights}+ nights",
                            ),
                            { percent: offer.percent, nights: offer.nights },
                          ).text
                        }
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-xl border bg-primary/5 p-3">
                <Input
                  aria-label={
                    resolve("host.calendar.discount_label", "Discount percentage").text
                  }
                  type="number"
                  min={0}
                  max={50}
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
                <span className="text-sm md:text-xs text-muted-foreground">
                  <Tx k="host.calendar.percent_off" source="% off" />
                </span>
                <Input
                  aria-label={
                    resolve(
                      "host.calendar.promotion_minimum_label",
                      "Promotion minimum stay",
                    ).text
                  }
                  type="number"
                  min={1}
                  max={365}
                  value={promotionMinimum}
                  onChange={(event) => setPromotionMinimum(event.target.value)}
                />
                <span className="text-sm md:text-xs text-muted-foreground">
                  <Tx k="host.calendar.nights" source="nights" />
                </span>
              </div>
              <OptionToggle
                checked={freeCleaning}
                label="Add free cleaning"
                description={`Guests save the €${cleaningFee} cleaning fee on qualifying stays.`}
                onChange={() => setFreeCleaning((current) => !current)}
              />
              {numericDiscount > 0 ? (
                <OptionToggle
                  checked={roundPromotion}
                  label={
                    resolve(
                      "host.calendar.promotion_round_label",
                      "Round to the nearest whole number",
                    ).text
                  }
                  description={
                    resolve(
                      "host.calendar.promotion_round_hint",
                      "Keeps discounted nightly prices clean.",
                    ).text
                  }
                  onChange={() => setRoundPromotion((current) => !current)}
                />
              ) : null}
              <OfferPreview
                headline={
                  <>
                    {numericDiscount > 0
                      ? interpolate(
                          resolve("host.calendar.summary_discount", "{percent}% off"),
                          { percent: numericDiscount },
                        ).text
                      : ""}
                    {numericDiscount > 0 && freeCleaning ? " + " : ""}
                    {freeCleaning
                      ? resolve("host.calendar.summary_cleaning", "free cleaning").text
                      : ""}
                    {
                      interpolate(
                        resolve("host.calendar.summary_minimum", " · {nights}+ nights"),
                        { nights: promotionMinimum || "0" },
                      ).text
                    }
                  </>
                }
              >
                {numericDiscount > 0 ? (
                  <p className={OFFER_PREVIEW_NOTE}>
                    {
                      interpolate(
                        resolve(
                          "host.calendar.estimated_price",
                          "Estimated default-night price: €{rate}",
                        ),
                        { rate: guestRate },
                      ).text
                    }
                    {roundPromotion
                      ? interpolate(
                          resolve(
                            "host.calendar.rounded_from",
                            " · rounded from €{original}",
                          ),
                          { original: Number(rawGuestRate.toFixed(2)) },
                        ).text
                      : ""}
                  </p>
                ) : null}
                <p className={cn(OFFER_PREVIEW_NOTE, "mt-1")}>
                  <Tx
                    k="host.calendar.promotion_priority"
                    source="Date-specific offers take priority. Otherwise, the highest qualifying minimum-stay threshold wins."
                  />
                </p>
              </OfferPreview>
              <div className={cn(STICKY_FOOTER, "flex justify-end gap-2")}>
                <Button type="button" variant="outline" onClick={onClose}>
                  <Tx k="host.calendar.cancel" source="Cancel" />
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={savePromotion}
                >
                  {state.promotion ? "Update promotion" : "Create promotion"}
                </Button>
              </div>
            </div>
          ) : null}
          </div>
        </DialogContent>
      </Dialog>
      {pickerOpen ? (
        <RangePickerDialog
          open
          value={range}
          title={editorMeta.pickerTitle}
          locale={locale}
          onOpenChange={setPickerOpen}
          onApply={(nextRange) => {
            setRange(nextRange);
            onStateChange({ ...state, range: nextRange ?? null });
          }}
        />
      ) : null}
    </>
  );
}

export function CalendarWorkspace({
  listingId,
  listingTitle,
  listingStatus,
  lens,
  locale,
  currency,
  baseNightlyRate,
  cleaningFee,
  minNights,
  datePrices,
  blocks,
  promotions,
  initialFrom,
  initialTo,
}: CalendarWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolve } = useI18n();
  const meta = LENS_META[lens];
  const [range, setRange] = useState<DateRange | undefined>(() =>
    initialFrom
      ? {
          from: parseLocalYmd(initialFrom),
          to: parseLocalYmd(initialTo ?? initialFrom),
        }
      : undefined,
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [filter, setFilter] = useState<ChangeFilter>("all");
  const [filterFrom, setFilterFrom] = useState<Date>();
  const [filterTo, setFilterTo] = useState<Date>();
  const [pending, startTransition] = useTransition();
  const calendarInteractionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!range?.from) return;

    function dismissSelection(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (calendarInteractionRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest(
          '[role="dialog"], [data-radix-popper-content-wrapper], [data-keeps-calendar-selection]',
        )
      ) {
        return;
      }
      setRange(undefined);
    }

    document.addEventListener("pointerdown", dismissSelection);
    return () => document.removeEventListener("pointerdown", dismissSelection);
  }, [range?.from]);

  // Mirror the selection into the URL so switching lenses keeps it, and so a
  // reloaded or shared link reopens the same dates. Debounced because
  // onRangeChange fires on every step of a drag and each replace refetches the
  // server component.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (range?.from) {
        params.set("from", dateKey(range.from));
        params.set("to", dateKey(range.to ?? range.from));
      } else {
        params.delete("from");
        params.delete("to");
      }
      const query = params.toString();
      const next = query ? `${pathname}?${query}` : pathname;
      if (next === window.location.pathname + window.location.search) return;
      router.replace(next, { scroll: false });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [range, pathname, router]);

  const selectionQuery = range?.from
    ? `?from=${dateKey(range.from)}&to=${dateKey(range.to ?? range.from)}`
    : "";
  const lensHref = (target: CalendarLens) =>
    `/host/listings/${listingId}/${LENS_META[target].segment}${selectionQuery}`;

  const priceByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of datePrices) {
      map.set(dbDateToYmd(row.date), Number(row.nightlyRate));
    }
    return map;
  }, [datePrices]);

  const promotionByDate = useMemo(
    () => promotionLabelByDate(promotions),
    [promotions],
  );

  const { manualDates, bookingDates } = useMemo(() => {
    const manual = new Set<string>();
    const booking = new Set<string>();
    for (const block of blocks) {
      const target = block.blockType === "MANUAL_BLOCK" ? manual : booking;
      for (const day of eachYmdExclusive(
        dbDateToYmd(block.startDate),
        dbDateToYmd(block.endDate),
      )) {
        target.add(day);
      }
    }
    return { manualDates: manual, bookingDates: booking };
  }, [blocks]);

  const changes = useMemo<ScheduledChange[]>(() => {
    const blockChanges = blocks.map((block) => {
      const from = dbDateToYmd(block.startDate);
      const to = addDaysToYmd(dbDateToYmd(block.endDate), -1);
      const booking = block.blockType !== "MANUAL_BLOCK";
      return {
        id: block.id,
        kind: booking ? ("booking" as const) : ("block" as const),
        from,
        to,
        label: booking ? "Booked" : "Blocked",
        detail: booking
          ? block.booking
            ? `${block.booking.guest.name} · ${block.booking.status}`
            : "Protected reservation"
          : block.reason?.trim() || "No reason added",
        source: booking ? "Reservation" : "Manual block",
      };
    });

    const priceChanges: ScheduledChange[] = [];
    const sortedPrices = [...datePrices]
      .map((row) => ({
        date: dbDateToYmd(row.date),
        rate: Number(row.nightlyRate),
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
    for (const row of sortedPrices) {
      const previous = priceChanges[priceChanges.length - 1];
      if (
        previous?.kind === "price" &&
        previous.detail === `${currency} ${row.rate}` &&
        previous.to &&
        addDaysToYmd(previous.to, 1) === row.date
      ) {
        previous.to = row.date;
      } else {
        priceChanges.push({
          id: `price-${row.date}`,
          kind: "price",
          from: row.date,
          to: row.date,
          label: `€${row.rate} / night`,
          detail: `${currency} ${row.rate}`,
          source: `Default €${baseNightlyRate}`,
          nightlyRate: row.rate,
        });
      }
    }

    const promotionChanges = promotions.map((promotion) => {
      const from = promotion.startDate
        ? dbDateToYmd(promotion.startDate)
        : undefined;
      const to = promotion.endDate
        ? addDaysToYmd(dbDateToYmd(promotion.endDate), -1)
        : undefined;
      const benefit = [
        promotion.discountPercent > 0
          ? `${promotion.discountPercent}% off`
          : null,
        promotion.freeCleaning ? "free cleaning" : null,
      ]
        .filter(Boolean)
        .join(" + ");
      return {
        id: promotion.id,
        kind: "promotion" as const,
        from,
        to,
        label: benefit,
        detail: `${promotion.minimumNights ?? minNights}+ nights`,
        source: from && to ? "Specific dates" : "Always active",
        promotion,
      };
    });

    return [...blockChanges, ...priceChanges, ...promotionChanges].sort(
      (left, right) =>
        (left.from ?? "0000").localeCompare(right.from ?? "0000"),
    );
  }, [baseNightlyRate, blocks, currency, datePrices, minNights, promotions]);

  const selection = range?.from ? calendarRangeToInput(range) : null;
  const selectionNights = selection?.nights ?? 0;
  const selectionCounts = selection
    ? countSelectionNights(selection, manualDates, bookingDates)
    : { nights: 0, blocked: 0, booked: 0, open: 0 };
  const primaryAction =
    lens === "availability"
      ? {
          label: "Show or hide listing",
          detail: selection
            ? selectionSummary(selectionCounts)
            : "With no dates selected this controls the whole listing.",
          icon: LockKeyhole,
        }
      : lens === "pricing"
        ? {
            label: selection ? "Set price for these dates" : "Change base price",
            detail: selection
              ? `Applies to the ${selectionNights} selected ${selectionNights === 1 ? "night" : "nights"}. Existing bookings keep the price guests already paid.`
              : `The base rate every date without a custom price uses. Currently ${new Intl.NumberFormat(
                  "en",
                  { style: "currency", currency, maximumFractionDigits: 0 },
                ).format(baseNightlyRate)}.`,
            icon: CircleDollarSign,
          }
        : {
            label: selection ? "Discount these dates" : "Create a promotion",
            detail: selection
              ? `Applies to the ${selectionNights} selected ${selectionNights === 1 ? "night" : "nights"}. Date-specific promotions take priority over always-active ones.`
              : "With no dates selected the promotion is always active.",
            icon: BadgePercent,
          };
  const PrimaryActionIcon = primaryAction.icon;

  const lensChanges = changes.filter((change) =>
    meta.changeKinds.includes(change.kind),
  );

  const filteredChanges = lensChanges.filter((change) => {
    if (filter !== "all" && change.kind !== filter) return false;
    if (!change.from || !change.to) return true;
    const from = parseLocalYmd(change.from);
    const to = parseLocalYmd(change.to);
    if (filterFrom && isBefore(to, filterFrom)) return false;
    if (filterTo && isAfter(from, filterTo)) return false;
    return true;
  });

  function report(
    action: () => Promise<{ success?: string; error?: string } | undefined>,
    fallback: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result?.success ?? fallback);
      setRange(undefined);
      router.refresh();
    });
  }

  function openSelectedRange() {
    if (!selection) return;
    report(
      () =>
        openCalendarRange(listingId, {
          startDate: selection.startDate,
          endDate: selection.endDate,
        }),
      "Dates made available.",
    );
  }

  function editChange(change: ScheduledChange) {
    if (change.kind === "promotion" && change.promotion) {
      setEditor({ kind: "promotion", promotion: change.promotion });
      return;
    }
    if (!change.from || !change.to) return;
    const changeRange = {
      from: parseLocalYmd(change.from),
      to: parseLocalYmd(change.to),
    };
    setEditor({
      kind: change.kind === "price" ? "price" : "availability",
      range: changeRange,
      initialPrice: change.kind === "price" ? change.nightlyRate : undefined,
    });
  }

  function removeChange(change: ScheduledChange) {
    if (change.kind === "promotion") {
      report(
        () => removeCalendarPromotion(listingId, change.id),
        "Promotion removed.",
      );
      return;
    }
    if (!change.from || !change.to) return;
    const endDate = addDaysToYmd(change.to, 1);
    if (change.kind === "price") {
      report(
        () =>
          clearCalendarDatePrice(listingId, {
            startDate: change.from!,
            endDate,
          }),
        "Custom price removed.",
      );
      return;
    }
    report(
      () =>
        openCalendarRange(listingId, {
          startDate: change.from!,
          endDate,
        }),
      "Dates made available.",
    );
  }

  // Availability → Pricing → Promotions is the order a host works in, so the
  // empty action bar offers the next one instead of sitting idle.
  const nextLens: CalendarLens | null =
    lens === "availability"
      ? "pricing"
      : lens === "pricing"
        ? "promotions"
        : null;

  /**
   * Rendered twice: inside the card on desktop, and portaled into the fixed phone
   * bar. On a phone the card's copy would sit below the fold, under the nav — which
   * is how a host could reach this screen and see no action at all.
   */
  const actionPanel = (
    <>
      {selection ? (
        <p className="mb-2 text-center text-sm font-medium text-muted-foreground md:text-xs">
          {rangeLabel(selection.startDate, selection.lastDate, true)} ·{" "}
          {selection.nights} {selection.nights === 1 ? "night" : "nights"}
        </p>
      ) : (
        <p className="mb-2 text-center text-xs font-medium text-muted-foreground md:text-[0.68rem]">
          {meta.emptyHint}
        </p>
      )}
      <div className="mx-auto w-full max-w-3xl space-y-2">
        {lens === "availability" && selection ? (
          // Blocking and opening are opposite commits, not one "manage" step,
          // so each gets its own button and goes dim when it would be a no-op.
          // Opening needs no options, so it acts straight away; blocking opens
          // the sheet because it can carry a reason.
          <div className="flex items-stretch gap-2">
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="flex-1"
              disabled={pending || selectionCounts.blocked === 0}
              onClick={openSelectedRange}
            >
              <BedDouble className="size-4" />
              <Tx k="host.calendar.make_available" source="Make available" />
            </Button>
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={pending || selectionCounts.open === 0}
              onClick={() =>
                setEditor({
                  kind: "availability",
                  range: { from: range!.from!, to: range!.to ?? range!.from! },
                })
              }
            >
              <LockKeyhole className="size-4" />
              <Tx k="host.calendar.block_dates" source="Block dates" />
            </Button>
          </div>
        ) : (
          <div className="flex items-stretch gap-2">
            <Button
              type="button"
              size="lg"
              className="flex-1"
              onClick={() =>
                setEditor({
                  kind: meta.editorKind,
                  range: range?.from
                    ? { from: range.from, to: range.to ?? range.from }
                    : undefined,
                })
              }
            >
              <PrimaryActionIcon className="size-4" />
              {primaryAction.label}
            </Button>
            {!selection && nextLens ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="shrink-0"
                asChild
              >
                <Link href={lensHref(nextLens)}>
                  <Tx k="host.calendar.next" source="Next:" />{" "}
                  {LENS_META[nextLens].heading}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        )}
        <p className="line-clamp-2 text-center text-xs text-muted-foreground md:line-clamp-none md:text-[0.65rem]">
          {primaryAction.detail}
        </p>
        {selection ? (
          // Peak dates are rarely a one-lens job. Once a range is chosen, offer
          // the other two lenses directly instead of making the host reselect.
          <div
            data-keeps-calendar-selection
            className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-0.5"
          >
            {(["availability", "pricing", "promotions"] as const)
              .filter((target) => target !== lens)
              .map((target) => (
                <Link
                  key={target}
                  href={lensHref(target)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/75 md:text-[0.68rem]"
                >
                  {target === "availability"
                    ? "Also block these dates"
                    : target === "pricing"
                      ? "Also price these dates"
                      : "Also discount these dates"}
                  <ArrowRight className="size-3" />
                </Link>
              ))}
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="space-y-5">
      <ListingActionBarPortal>
        <div className="border-t bg-background px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgb(0_0_0/0.04)]">
          {actionPanel}
        </div>
      </ListingActionBarPortal>

      <section
        ref={calendarInteractionRef}
        aria-label={`${listingTitle} calendar`}
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <DateRangeCalendarStep
          active
          fitViewport
          pagedDesktopMonthCount={2}
          selected={range}
          onRangeChange={setRange}
          dayVariant="availability"
          dragToSelect
          locale={locale}
          dayMeta={(day) => {
            const key = dateKey(day);
            // Each lens gets the whole sublabel line, so a cell never has to carry
            // three facts at once. Availability spells out its states rather than
            // relying on the fill colour alone.
            if (lens === "availability") {
              if (bookingDates.has(key)) return { sublabel: "Booked" };
              if (manualDates.has(key)) return { sublabel: "Blocked" };
              return { sublabel: "" };
            }
            if (lens === "pricing") {
              return {
                sublabel: new Intl.NumberFormat("en", {
                  style: "currency",
                  currency,
                  maximumFractionDigits: 0,
                }).format(priceByDate.get(key) ?? baseNightlyRate),
                isCustomPrice: priceByDate.has(key),
              };
            }
            return {
              sublabel: promotionByDate.get(key) ?? "",
              sublabelTone: "amber" as const,
            };
          }}
          dateModifiers={{
            // Reservations stay visible on every lens: they are the context that
            // explains why a date cannot be changed, whichever lens you are in.
            bookingHold: (day) => bookingDates.has(dateKey(day)),
            ...(lens === "availability"
              ? { manualBlock: (day: Date) => manualDates.has(dateKey(day)) }
              : {}),
            ...(lens === "pricing"
              ? { customPrice: (day: Date) => priceByDate.has(dateKey(day)) }
              : {}),
            ...(lens === "promotions"
              ? { promotion: (day: Date) => promotionByDate.has(dateKey(day)) }
              : {}),
          }}
          dateModifiersClassNames={{
            manualBlock:
              "bg-muted after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.09)_0,rgba(15,23,42,0.09)_4px,transparent_4px,transparent_8px)]",
            bookingHold: "bg-destructive/20",
            customPrice: "ring-2 ring-primary/40 ring-inset",
            promotion: "bg-amber-500/15",
          }}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-2 text-xs md:text-[0.68rem] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-destructive/25" />
            <Tx k="host.calendar.legend_booked" source="Booked" />
          </span>
          {lens === "availability" ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.18)_0,rgba(15,23,42,0.18)_2px,transparent_2px,transparent_4px)]" />
              <Tx k="host.calendar.legend_blocked" source="Blocked" />
            </span>
          ) : null}
          {lens === "pricing" ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px] border-2 border-primary/50" />
                <Tx k="host.calendar.legend_custom_price" source="Custom price" />
              </span>
              <span>
                {
                  interpolate(
                    resolve(
                      "host.calendar.legend_base_rate",
                      "Dates without a custom price use the base rate of {rate}.",
                    ),
                    {
                      rate: new Intl.NumberFormat(locale, {
                        style: "currency",
                        currency,
                        maximumFractionDigits: 0,
                      }).format(baseNightlyRate),
                    },
                  ).text
                }
              </span>
            </>
          ) : null}
          {lens === "promotions" ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px] bg-amber-500/30" />
                <Tx k="host.calendar.legend_promotion" source="Promotion" />
              </span>
              <span>
                <Tx
                  k="host.calendar.legend_promotion_note"
                  source="Always-active promotions apply to every date and are not shaded here."
                />
              </span>
            </>
          ) : null}
        </div>
        {/* Phones get this panel in the fixed bar instead, so it cannot end up
            below the fold under the nav. */}
        <div className="hidden border-t bg-stone-50 px-5 py-3 md:block">
          {actionPanel}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{meta.changesTitle}</h2>
              <p className="text-sm md:text-xs text-muted-foreground">
                {meta.changesDescription}
              </p>
            </div>
            <span className="text-sm md:text-xs text-muted-foreground">
              {
                interpolate(resolve("host.calendar.shown_count", "{count} shown"), {
                  count: filteredChanges.length,
                }).text
              }
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            {/* Only availability lists two kinds of row; on the other lenses the
                chips would all filter to the same thing. */}
            <div className="flex flex-wrap gap-1.5">
              {(meta.changeKinds.length > 1
                ? FILTERS.filter(
                    (item) =>
                      item.value === "all" ||
                      meta.changeKinds.includes(item.value as ChangeKind),
                  )
                : []
              ).map((item) => {
                const count =
                  item.value === "all"
                    ? lensChanges.length
                    : lensChanges.filter((change) => change.kind === item.value)
                        .length;
                return (
                  // No double-click to reset: on touch a double tap is the browser's
                  // zoom gesture, so that shortcut was unreachable on a phone and
                  // undiscoverable everywhere else. The Clear control below replaces it.
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={filter === item.value}
                    onClick={() => setFilter(item.value)}
                    className="min-h-9 rounded-full border px-3 py-1.5 text-sm md:text-xs font-medium aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background md:min-h-0"
                  >
                    {item.label} ({count})
                  </button>
                );
              })}
              {filter !== "all" || filterFrom || filterTo ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setFilter("all");
                    setFilterFrom(undefined);
                    setFilterTo(undefined);
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  <Tx k="host.calendar.clear_filters" source="Clear filters" />
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <DateFilter
                label="From"
                value={filterFrom}
                onChange={setFilterFrom}
              />
              <DateFilter label="To" value={filterTo} onChange={setFilterTo} />
            </div>
          </div>
        </div>
        {filteredChanges.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {lensChanges.length === 0
              ? meta.emptyLabel
              : "Nothing matches these filters."}
          </div>
        ) : (
          <div className="divide-y">
            {filteredChanges.map((change) => {
              const Icon =
                change.kind === "price"
                  ? CircleDollarSign
                  : change.kind === "promotion"
                    ? BadgePercent
                    : change.kind === "booking"
                      ? BedDouble
                      : LockKeyhole;
              const typeLabel =
                change.kind === "price"
                  ? "Price override"
                  : change.kind === "promotion"
                    ? "Promotion"
                    : change.kind === "booking"
                      ? "Reservation"
                      : "Availability";
              const dates =
                change.from && change.to
                  ? rangeLabel(change.from, change.to)
                  : "Always active";
              return (
                <div
                  key={change.id}
                  className="grid gap-3 px-5 py-3.5 sm:grid-cols-[8rem_8rem_minmax(0,1fr)_13rem] sm:items-center"
                >
                  <span className="text-sm font-medium">{dates}</span>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs md:text-[0.68rem] font-medium">
                    <Icon className="size-3.5" /> {typeLabel}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {change.label}
                    </span>
                    <span className="block truncate text-sm md:text-xs text-muted-foreground">
                      {change.detail} · {change.source}
                    </span>
                  </span>
                  {change.kind === "booking" ? (
                    <span className="text-right text-sm md:text-xs text-muted-foreground">
                      <Tx
                        k="host.calendar.protected_reservation"
                        source="Protected reservation"
                      />
                    </span>
                  ) : (
                    <span className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editChange(change)}
                      >
                        <Pencil className="size-3.5" />{" "}
                        <Tx k="host.workspace.edit" source="Edit" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => removeChange(change)}
                      >
                        {change.kind === "block" ? (
                          <UnlockKeyhole className="size-3.5" />
                        ) : change.kind === "promotion" ? (
                          <Trash2 className="size-3.5" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                        {change.kind === "block"
                          ? "Make available"
                          : change.kind === "promotion"
                            ? "Remove"
                            : "Reset"}
                      </Button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editor ? (
        <EditorDialog
          key={`${editor.kind}-${editor.promotion?.id ?? "new"}-${
            editor.range?.from?.getTime() ?? "global"
          }`}
          listingId={listingId}
          listingStatus={listingStatus}
          baseNightlyRate={baseNightlyRate}
          cleaningFee={cleaningFee}
          minNights={minNights}
          locale={locale}
          blockedDates={manualDates}
          bookedDates={bookingDates}
          state={editor}
          onStateChange={setEditor}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}
