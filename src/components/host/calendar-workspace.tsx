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

function officialMoney(amount: number | string, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(amount));
}
import { DateRangeCalendarStep } from "@/components/marketplace/marketplace-stay-date-picker";
import { ListingActionBarPortal } from "@/components/host/listing-action-bar-portal";
import { PercentAmountField } from "@/components/host/percent-amount-field";
import {
  OFFER_PREVIEW_NOTE,
  OfferPreview,
  OptionToggle,
  StandardPricingSummary,
  STICKY_FOOTER,
  roundToCleanPrice,
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
  setCalendarAvailabilityMode,
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

export interface WorkspaceAvailabilityWindow {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
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
  availabilityMode: "OPEN" | "CLOSED";
  lens: CalendarLens;
  locale: string;
  currency: string;
  baseNightlyRate: number;
  cleaningFee: number;
  minNights: number;
  datePrices: WorkspaceDatePrice[];
  blocks: WorkspaceBlock[];
  availabilityWindows: WorkspaceAvailabilityWindow[];
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
type ChangeKind = "booking" | "block" | "open" | "price" | "promotion";
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
  { value: "open", label: "Open dates" },
  { value: "price", label: "Prices" },
  { value: "promotion", label: "Promotions" },
  { value: "booking", label: "Reservations" },
];

/** The discounts hosts reach for, as labels under the promotion track. Everything
 *  between them is a drag away, and the field takes anything in range. */
const PROMOTION_PERCENT_STOPS = [
  { label: "5%", percent: 5 },
  { label: "10%", percent: 10 },
  { label: "15%", percent: 15 },
  { label: "20%", percent: 20 },
  { label: "30%", percent: 30 },
  { label: "50%", percent: 50 },
] as const;

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
    changeKinds: ["block", "open", "booking"],
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
    changesTitle: "Custom date prices",
    changesDescription: "Dates priced differently from the base price.",
    emptyLabel: "Every date uses the base price.",
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
  const i18n = useI18n();
  const { resolve } = i18n;
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
  currency,
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
  currency: string;
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
  /** The multiplier behind the chosen quick adjustment, or `null` once the host types
   *  their own figure — the rounding toggle recomputes from it so switching rounding
   *  off gives back the exact percentage rather than the rounded number. */
  const [priceFactor, setPriceFactor] = useState<number | null>(null);
  const [discount, setDiscount] = useState(
    String(state.promotion?.discountPercent ?? 15),
  );
  const [promotionMinimum, setPromotionMinimum] = useState(
    String(state.promotion?.minimumNights ?? minNights),
  );
  const [freeCleaning, setFreeCleaning] = useState(
    cleaningFee > 0 && (state.promotion?.freeCleaning ?? false),
  );
  const [roundPromotion, setRoundPromotion] = useState(
    state.promotion?.roundToWholeUnit ?? true,
  );

  /** One place decides what a price looks like in the field, so the chips, the toggle
   *  and the typed value can never disagree about it. */
  const applyRounding = (value: number, round: boolean) =>
    round ? roundToCleanPrice(value) : Number(value.toFixed(2));

  const setPriceFromPercent = (percent: number) => {
    const factor = 1 + percent / 100;
    setPriceFactor(factor);
    setPrice(String(applyRounding(baseNightlyRate * factor, roundPrice)));
  };

  const isDateScoped = Boolean(range?.from);
  /** A percentage needs something to be a percentage of. Editing the base price is
   *  editing that something, so there the amount stands on its own. */
  const showPricePercent = isDateScoped && baseNightlyRate > 0;
  /** A chosen adjustment answers for itself — rounding €88 up to €90 must not report
   *  itself back as +13% — while a typed amount is measured against the base price. */
  const pricePercent = !showPricePercent
    ? null
    : priceFactor !== null
      ? Math.round((priceFactor - 1) * 100)
      : Number.isFinite(Number(price))
        ? Math.round((Number(price) / baseNightlyRate - 1) * 100)
        : 0;
  const priceStops = [
    { label: "−50%", percent: -50 },
    { label: "−20%", percent: -20 },
    { label: resolve("host.prepublish.rate_base", "Base").text, percent: 0 },
    { label: "+20%", percent: 20 },
    { label: "+50%", percent: 50 },
    { label: "+100%", percent: 100 },
  ];
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
            title: isDateScoped
              ? i18n.resolve(
                  "host.calendar.price_editor.custom_title",
                  "Set custom date price",
                ).text
              : i18n.resolve(
                  "host.calendar.price_editor.standard_title",
                  "Edit standard pricing",
                ).text,
            description: isDateScoped
              ? i18n.resolve(
                  "host.calendar.price_editor.custom_description",
                  "Set a price for the selected dates.",
                ).text
              : i18n.resolve(
                  "host.calendar.price_editor.standard_description",
                  "Change the base price, cleaning fee, or minimum stay.",
                ).text,
            icon: CircleDollarSign,
            pickerTitle: "Select pricing dates",
          }
        : {
            title: state.promotion ? "Edit promotion" : "Create a promotion",
            description: isDateScoped
              ? "Choose the benefits for these dates."
              : "Set the stay threshold, benefits, and date scope.",
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
        i18n.resolve(
          "host.calendar.price_editor.custom_saved",
          "Custom date price saved.",
        ).text,
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
      i18n.resolve(
        "host.calendar.price_editor.standard_saved",
        "Standard pricing saved.",
      ).text,
    );
  }

  function savePromotion() {
    const discountPercent = Number(discount);
    // The selected dates are the eligibility boundary for a custom-date offer.
    // A separate minimum-stay condition belongs only to an always-active promotion.
    const promotionNights = isDateScoped ? minNights : Number(promotionMinimum);
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
        ? `Standard pricing · ${officialMoney(baseNightlyRate, currency)} base price`
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
              {/* The percentage and the money it comes to on one line: either side
                  can be typed, the slider moves both, and nothing scrolls sideways.
                  The percentage only means something against a base price, so it sits
                  out when the base price itself is what is being edited. */}
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.035] p-4 shadow-sm">
                <Label
                  htmlFor={
                    showPricePercent
                      ? "nightly-price-percent"
                      : "nightly-price-amount"
                  }
                  className="text-sm font-semibold"
                >
                  {isDateScoped ? (
                    <Tx
                      k="host.calendar.price_editor.custom_price"
                      source="Custom date price"
                    />
                  ) : (
                    <Tx
                      k="host.calendar.price_editor.base_price"
                      source="Base price"
                    />
                  )}
                </Label>
                <PercentAmountField
                  className="mt-2"
                  id="nightly-price"
                  percent={pricePercent}
                  amount={Number.isFinite(Number(price)) ? Number(price) : null}
                  onPercentChange={setPriceFromPercent}
                  onAmountChange={(value) => {
                    setPriceFactor(null);
                    setPrice(String(value));
                  }}
                  min={-50}
                  max={100}
                  grow={50}
                  limitMin={-95}
                  limitMax={900}
                  stops={priceStops}
                  currency={currency}
                  hidePercent={!showPricePercent}
                  percentLabel={
                    resolve(
                      "host.prepublish.rate_percent_label",
                      "Percentage of your normal price",
                    ).text
                  }
                  amountLabel={
                    resolve("host.calendar.per_night", "per night").text
                  }
                />
                <p className="mt-3 text-sm text-muted-foreground md:text-xs">
                  {showPricePercent ? (
                    <Tx
                      k="host.prepublish.rate_pair_hint"
                      source="Type a percentage or an exact amount — the other one follows."
                    />
                  ) : (
                    <Tx
                      k="host.prepublish.rate_exact_hint"
                      source="Tap the field to type an exact amount."
                    />
                  )}
                </p>
              </div>
              {/* Same keys as the wizard's price sheet: the two surfaces round the
                  same way now, so they should not say it in two different voices —
                  and this copy was the one that had never been translated. */}
              <OptionToggle
                checked={roundPrice}
                label={
                  i18n.resolve(
                    "host.prepublish.round_clean_label",
                    "Round to the closest round number",
                  ).text
                }
                description={
                  i18n.resolve(
                    "host.prepublish.round_hint",
                    "Keeps guest-facing prices clean and easy to scan.",
                  ).text
                }
                onChange={() => {
                  const next = !roundPrice;
                  setRoundPrice(next);
                  const source =
                    priceFactor !== null && baseNightlyRate > 0
                      ? baseNightlyRate * priceFactor
                      : Number(price);
                  if (Number.isFinite(source) && source > 0) {
                    setPrice(String(applyRounding(source, next)));
                  }
                }}
              />
              {!isDateScoped ? (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm md:text-xs font-semibold text-muted-foreground">
                    <Tx
                      k="host.calendar.additional_defaults"
                      source="Standard stay settings"
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
                        <Tx k="host.calendar.minimum_nights" source="Minimum stay" />
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
                  {isDateScoped ? (
                    <Tx
                      k="host.calendar.price_editor.custom_scope_hint"
                      source="This custom date price overrides the base price only for the selected dates."
                    />
                  ) : (
                    <Tx
                      k="host.calendar.price_editor.standard_scope_hint"
                      source="Existing custom date prices remain unchanged. The new base price applies everywhere else."
                    />
                  )}
                </p>
              </div>
              <div className={STICKY_FOOTER}>
                <div className="mb-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm md:text-xs">
                  <span className="min-w-0 break-words text-muted-foreground">
                    {isDateScoped ? (
                      <Tx
                        k="host.calendar.price_editor.base_price"
                        source="Base price"
                      />
                    ) : (
                      <Tx
                        k="host.calendar.price_editor.current_base_price"
                        source="Current base price"
                      />
                    )}{" "}
                    <strong
                      className="notranslate whitespace-nowrap text-foreground"
                      translate="no"
                    >
                      {officialMoney(baseNightlyRate, currency)}
                    </strong>
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span className="min-w-0 break-words text-primary">
                    {isDateScoped ? (
                      <Tx
                        k="host.calendar.price_editor.custom_price"
                        source="Custom date price"
                      />
                    ) : (
                      <Tx
                        k="host.calendar.price_editor.new_base_price"
                        source="New base price"
                      />
                    )}{" "}
                    <strong className="notranslate whitespace-nowrap" translate="no">
                      {officialMoney(price || "0", currency)}
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
                    {isDateScoped ? (
                      <Tx
                        k="host.calendar.price_editor.save_custom"
                        source="Save custom date price"
                      />
                    ) : (
                      <Tx
                        k="host.calendar.price_editor.save_standard"
                        source="Save standard pricing"
                      />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {state.kind === "promotion" ? (
            <div className="space-y-4 p-6">
              {isDateScoped ? null : (
                <fieldset>
                  <legend className="text-sm font-semibold">
                    <Tx
                      k="host.calendar.recommended_offers"
                      source="Recommended offers"
                    />
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
                        <span className="block text-sm font-semibold md:text-xs">
                          {offer.title}
                        </span>
                        <span className="text-xs text-muted-foreground md:text-[0.65rem]">
                          {
                            interpolate(
                              resolve(
                                "host.calendar.offer_summary",
                                "{percent}% · {nights}+ nights",
                              ),
                              {
                                percent: offer.percent,
                                nights: offer.nights,
                              },
                            ).text
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {/* One decision, one card: the discount, what a night comes to with
                  it, and a track between the offers hosts pick most. */}
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.035] p-4 shadow-sm">
                <Label
                  htmlFor="calendar-promotion-discount-percent"
                  className="text-sm font-semibold"
                >
                  <Tx k="host.form.offer_percentage" source="Percentage" />
                </Label>
                <PercentAmountField
                  className="mt-2"
                  id="calendar-promotion-discount"
                  percent={numericDiscount > 0 ? numericDiscount : null}
                  amount={
                    numericDiscount > 0 && baseNightlyRate > 0 ? guestRate : null
                  }
                  onPercentChange={(percent) =>
                    setDiscount(String(Math.round(percent)))
                  }
                  onPercentClear={() => setDiscount("")}
                  onAmountChange={(value) => {
                    if (baseNightlyRate <= 0) return;
                    const percent = Math.round(
                      (1 - value / baseNightlyRate) * 100,
                    );
                    setDiscount(String(Math.min(50, Math.max(5, percent))));
                  }}
                  min={5}
                  max={50}
                  stops={PROMOTION_PERCENT_STOPS}
                  currency={currency}
                  hideAmount={baseNightlyRate <= 0}
                  percentLabel={
                    resolve("host.calendar.discount_label", "Discount percentage")
                      .text
                  }
                  amountLabel={
                    resolve("host.calendar.per_night", "per night").text
                  }
                />
                <p className="mt-3 text-sm text-muted-foreground md:text-xs">
                  {
                    interpolate(
                      resolve(
                        "host.prepublish.discount_hint",
                        "Between {min}% and {max}%.",
                      ),
                      { min: 5, max: 50 },
                    ).text
                  }
                </p>
              </div>
              {isDateScoped ? null : (
                <div>
                  <Label htmlFor="calendar-promotion-minimum">
                    <Tx
                      k="host.calendar.promotion_minimum_label"
                      source="Promotion minimum stay"
                    />
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="calendar-promotion-minimum"
                      type="number"
                      min={1}
                      max={365}
                      value={promotionMinimum}
                      onChange={(event) =>
                        setPromotionMinimum(event.target.value)
                      }
                      className="pr-16"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground md:text-xs">
                      <Tx k="host.calendar.nights" source="nights" />
                    </span>
                  </div>
                </div>
              )}
              <OptionToggle
                checked={freeCleaning}
                label={
                  i18n.resolve(
                    "host.calendar.promotion_free_cleaning",
                    "Add free cleaning",
                  ).text
                }
                description={
                  cleaningFee > 0
                    ? interpolate(
                        i18n.resolve(
                          "host.calendar.promotion_free_cleaning_hint",
                          "Guests save the {fee} cleaning fee on qualifying stays.",
                        ),
                        { fee: officialMoney(cleaningFee, currency) },
                      ).text
                    : i18n.resolve(
                        "host.calendar.promotion_no_cleaning_fee",
                        "There is no cleaning fee to waive. Set one in Pricing first.",
                      ).text
                }
                onChange={() => setFreeCleaning((current) => !current)}
                disabled={cleaningFee <= 0}
              />
              {cleaningFee <= 0 ? (
                <Link
                  href={`/host/listings/${listingId}/pricing${
                    selectedInput
                      ? `?from=${selectedInput.startDate}&to=${selectedInput.lastDate}`
                      : ""
                  }`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary/75 md:text-xs"
                >
                  <Tx
                    k="host.calendar.promotion_set_cleaning_fee"
                    source="Set cleaning fee in Pricing"
                  />
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              ) : null}
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
                    {!isDateScoped
                      ? interpolate(
                          resolve(
                            "host.calendar.summary_minimum",
                            " · {nights}+ nights",
                          ),
                          { nights: promotionMinimum || "0" },
                        ).text
                      : ""}
                  </>
                }
              >
                {numericDiscount > 0 ? (
                  <p className={OFFER_PREVIEW_NOTE}>
                    {
                      interpolate(
                        resolve(
                          "host.calendar.estimated_price",
                          "Estimated base-night price: {rate}",
                        ),
                        { rate: officialMoney(guestRate, currency) },
                      ).text
                    }
                    {roundPromotion
                      ? interpolate(
                          resolve(
                            "host.calendar.rounded_from",
                            " · rounded from {original}",
                          ),
                          {
                            original: officialMoney(
                              Number(rawGuestRate.toFixed(2)),
                              currency,
                            ),
                          },
                        ).text
                      : ""}
                  </p>
                ) : null}
                {!isDateScoped ? (
                  <p className={cn(OFFER_PREVIEW_NOTE, "mt-1")}>
                    <Tx
                      k="host.calendar.promotion_priority"
                      source="Date-specific offers take priority. Otherwise, the highest qualifying minimum-stay threshold wins."
                    />
                  </p>
                ) : null}
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
  availabilityMode,
  lens,
  locale,
  currency,
  baseNightlyRate,
  cleaningFee,
  minNights,
  datePrices,
  blocks,
  availabilityWindows,
  promotions,
  initialFrom,
  initialTo,
}: CalendarWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const i18n = useI18n();
  const { resolve } = i18n;
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
  const openedDates = useMemo(() => {
    const opened = new Set<string>();
    for (const window of availabilityWindows) {
      for (const day of eachYmdExclusive(
        dbDateToYmd(window.startDate),
        dbDateToYmd(window.endDate),
      )) {
        opened.add(day);
      }
    }
    return opened;
  }, [availabilityWindows]);

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

    const openChanges: ScheduledChange[] = availabilityWindows.map((window) => ({
      id: window.id,
      kind: "open",
      from: dbDateToYmd(window.startDate),
      to: addDaysToYmd(dbDateToYmd(window.endDate), -1),
      label: "Open",
      detail: "Guests can book this range",
      source: "Explicit availability",
    }));

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
          label: `${officialMoney(row.rate, currency)} / night`,
          detail: `${currency} ${row.rate}`,
          source: `Base price ${officialMoney(baseNightlyRate, currency)}`,
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

    return [...blockChanges, ...openChanges, ...priceChanges, ...promotionChanges].sort(
      (left, right) =>
        (left.from ?? "0000").localeCompare(right.from ?? "0000"),
    );
  }, [availabilityWindows, baseNightlyRate, blocks, currency, datePrices, minNights, promotions]);

  const selection = range?.from ? calendarRangeToInput(range) : null;
  const publishedBasePriceHint = i18n.resolve(
    "host.calendar.published_legend_base_price_hint",
    "Dates without a custom date price use the base price of {rate}.",
  );
  const selectionNights = selection?.nights ?? 0;
  const selectionCounts = selection
    ? availabilityMode === "CLOSED"
      ? (() => {
          let open = 0;
          let booked = 0;
          let nights = 0;
          for (const day of eachYmdExclusive(selection.startDate, selection.endDate)) {
            nights += 1;
            if (bookingDates.has(day)) booked += 1;
            else if (openedDates.has(day) && !manualDates.has(day)) open += 1;
          }
          return { nights, open, booked, blocked: nights - open - booked };
        })()
      : countSelectionNights(selection, manualDates, bookingDates)
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
            label: selection
              ? "Set price for these dates"
              : "Select dates for a custom price",
            detail: selection
              ? `Saves a custom date price for the ${selectionNights} selected ${selectionNights === 1 ? "night" : "nights"}. Existing bookings keep the price guests already paid.`
              : "Tap or drag across dates, then set a custom date price for that range.",
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

  function changeAvailabilityMode(mode: "OPEN" | "CLOSED") {
    if (mode === availabilityMode) return;
    if (
      mode === "CLOSED" &&
      !window.confirm(
        resolve(
          "host.calendar.switch_closed_confirm",
          "Switch to only dates you open? Every other date will close and the listing will disappear from undated search.",
        ).text,
      )
    ) {
      return;
    }
    report(
      () => setCalendarAvailabilityMode(listingId, mode),
      mode === "CLOSED"
        ? "Only explicitly opened dates are now bookable."
        : "Dates are now open unless you block them.",
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
    if (change.kind === "open") {
      report(
        () =>
          blockCalendarRange(listingId, {
            startDate: change.from!,
            endDate,
          }),
        "Dates closed.",
      );
      return;
    }
    if (change.kind === "price") {
      report(
        () =>
          clearCalendarDatePrice(listingId, {
            startDate: change.from!,
            endDate,
          }),
        "Custom date price removed.",
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
              {availabilityMode === "CLOSED" ? (
                <Tx k="host.calendar.open_dates" source="Open dates" />
              ) : (
                <Tx k="host.calendar.make_available" source="Make available" />
              )}
            </Button>
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={pending || selectionCounts.open === 0}
              onClick={() => {
                if (availabilityMode === "CLOSED" && selection) {
                  report(
                    () =>
                      blockCalendarRange(listingId, {
                        startDate: selection.startDate,
                        endDate: selection.endDate,
                      }),
                    "Dates closed.",
                  );
                  return;
                }
                setEditor({
                  kind: "availability",
                  range: { from: range!.from!, to: range!.to ?? range!.from! },
                });
              }}
            >
              <LockKeyhole className="size-4" />
              {availabilityMode === "CLOSED" ? (
                <Tx k="host.calendar.close_dates" source="Close dates" />
              ) : (
                <Tx k="host.calendar.block_dates" source="Block dates" />
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-stretch gap-2">
            {lens !== "pricing" || selection ? (
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
      {lens === "pricing" ? (
        <StandardPricingSummary
          baseNightlyRate={baseNightlyRate}
          cleaningFee={cleaningFee}
          minNights={minNights}
          currency={currency}
          locale={locale}
          onEdit={() => setEditor({ kind: "price", range: null })}
        />
      ) : null}

      {lens !== "pricing" || selection ? (
        <ListingActionBarPortal>
          <div className="border-t bg-background px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgb(0_0_0/0.04)]">
            {actionPanel}
          </div>
        </ListingActionBarPortal>
      ) : null}

      <section
        ref={calendarInteractionRef}
        aria-label={`${listingTitle} calendar`}
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        {lens === "availability" ? (
          <div className="border-b bg-muted/20 p-4 md:px-5">
            <p className="text-sm font-semibold">
              <Tx
                k="host.calendar.availability_strategy"
                source="Availability strategy"
              />
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Tx
                k="host.calendar.availability_strategy_hint"
                source="Choose whether dates start open or stay closed until you open them."
              />
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={availabilityMode === "OPEN" ? "default" : "outline"}
                disabled={pending}
                onClick={() => changeAvailabilityMode("OPEN")}
              >
                <Tx k="host.calendar.open_by_default" source="Open by default" />
              </Button>
              <Button
                type="button"
                variant={availabilityMode === "CLOSED" ? "default" : "outline"}
                disabled={pending}
                onClick={() => changeAvailabilityMode("CLOSED")}
              >
                <Tx
                  k="host.calendar.only_dates_open"
                  source="Only dates I open"
                />
              </Button>
            </div>
          </div>
        ) : null}
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
              if (availabilityMode === "CLOSED") {
                return { sublabel: openedDates.has(key) ? "Open" : "Closed" };
              }
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
              ? {
                  manualBlock: (day: Date) => manualDates.has(dateKey(day)),
                  ...(availabilityMode === "CLOSED"
                    ? {
                        openWindow: (day: Date) => openedDates.has(dateKey(day)),
                        closedDefault: (day: Date) => !openedDates.has(dateKey(day)),
                      }
                    : {}),
                }
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
            closedDefault: "bg-muted/60 text-muted-foreground",
            openWindow: "bg-emerald-500/15 ring-2 ring-emerald-600/35 ring-inset",
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
            availabilityMode === "CLOSED" ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px] bg-emerald-500/25 ring-1 ring-emerald-600/40" />
                  <Tx k="host.calendar.legend_open" source="Open" />
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px] bg-muted" />
                  <Tx k="host.calendar.legend_closed" source="Closed" />
                </span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px] bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.18)_0,rgba(15,23,42,0.18)_2px,transparent_2px,transparent_4px)]" />
                <Tx k="host.calendar.legend_blocked" source="Blocked" />
              </span>
            )
          ) : null}
          {lens === "pricing" ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px] border-2 border-primary/50" />
                <Tx
                  k="host.calendar.published_legend_custom_date_price"
                  source="Custom date price"
                />
              </span>
              <span>
                {
                  interpolate(
                    publishedBasePriceHint,
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
                      : change.kind === "open"
                        ? UnlockKeyhole
                        : LockKeyhole;
              const typeLabel =
                change.kind === "price"
                  ? "Custom date price"
                  : change.kind === "promotion"
                    ? "Promotion"
                    : change.kind === "booking"
                      ? "Reservation"
                      : change.kind === "open"
                        ? "Open dates"
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
                      {change.kind !== "open" ? <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editChange(change)}
                      >
                        <Pencil className="size-3.5" />{" "}
                        <Tx k="host.workspace.edit" source="Edit" />
                      </Button> : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => removeChange(change)}
                      >
                        {change.kind === "block" ? (
                          <UnlockKeyhole className="size-3.5" />
                        ) : change.kind === "open" ? (
                          <LockKeyhole className="size-3.5" />
                        ) : change.kind === "promotion" ? (
                          <Trash2 className="size-3.5" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                        {change.kind === "block"
                          ? "Make available"
                          : change.kind === "open"
                            ? "Close dates"
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
          currency={currency}
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
