"use client";

import {
  addDays,
  eachDayOfInterval,
  format,
  isAfter,
  isBefore,
  isWithinInterval,
} from "date-fns";
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
  Sparkles,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import {
  blockCalendarRange,
  clearCalendarDatePrice,
  hideListingFromCalendar,
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
  roundUpToNearestFive: boolean;
  startDate: Date | string | null;
  endDate: Date | string | null;
  createdAt: Date | string;
}

export interface CalendarWorkspaceProps {
  listingId: string;
  listingTitle: string;
  listingStatus: string;
  locale: string;
  currency: string;
  baseNightlyRate: number;
  cleaningFee: number;
  minNights: number;
  datePrices: WorkspaceDatePrice[];
  blocks: WorkspaceBlock[];
  promotions: WorkspacePromotion[];
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

function dbPromotionRange(
  promotion: WorkspacePromotion,
): DateRange | undefined {
  if (!promotion.startDate || !promotion.endDate) return undefined;
  const from = parseLocalYmd(dbDateToYmd(promotion.startDate));
  const lastDate = addDaysToYmd(dbDateToYmd(promotion.endDate), -1);
  return { from, to: parseLocalYmd(lastDate) };
}

function InlineDateScope({
  label,
  range,
  onOpen,
}: {
  label: string;
  range?: DateRange;
  onOpen: () => void;
}) {
  const input = range?.from ? calendarRangeToInput(range) : null;
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold">{label}</p>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/75"
      >
        <CalendarRange className="size-3.5" />
        {input
          ? `${rangeLabel(input.startDate, input.lastDate)} · Change dates`
          : "Select dates"}
      </button>
    </div>
  );
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
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-[52rem]">
        <DialogHeader>
          <div className="border-b px-6 py-5 pr-12 text-left">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1">
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
              disabled={!normalized}
              onClick={() => {
                onApply(normalized);
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

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: Date;
  onChange: (date?: Date) => void;
}) {
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
            <span className="block text-[0.55rem] font-semibold tracking-wide text-muted-foreground uppercase">
              {label}
            </span>
            <span className="block text-xs font-medium">
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
              className="w-full text-xs"
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

function Toggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-xl border p-3 text-left transition-colors",
        checked
          ? "border-primary bg-primary/5"
          : "bg-muted/20 hover:border-primary/30",
      )}
    >
      <span>
        <span className="block text-xs font-semibold">{label}</span>
        <span className="mt-0.5 block text-[0.65rem] text-muted-foreground">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/25",
        )}
      >
        <span
          className={cn(
            "absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}

function EditorDialog({
  listingId,
  listingStatus,
  baseNightlyRate,
  cleaningFee,
  minNights,
  locale,
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
  state: EditorState;
  onStateChange: (state: EditorState) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [range, setRange] = useState<DateRange | undefined>(
    state.range === null
      ? undefined
      : (state.range ??
          (state.promotion ? dbPromotionRange(state.promotion) : undefined)),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [availability, setAvailability] = useState<"available" | "blocked">(
    "blocked",
  );
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
    state.promotion?.roundUpToNearestFive ?? true,
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

  function saveAvailability() {
    if (!selectedInput) {
      if (visibility === "visible") {
        toast.success("Listing remains visible.");
        onClose();
        return;
      }
      report(() => hideListingFromCalendar(listingId), "Listing hidden.");
      return;
    }
    if (availability === "blocked") {
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
          roundUpToNearestFive: discountPercent > 0 && roundPromotion,
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

  const numericDiscount = Math.min(50, Math.max(0, Number(discount) || 0));
  const rawGuestRate = baseNightlyRate * (1 - numericDiscount / 100);
  const guestRate = roundPromotion
    ? Math.ceil(rawGuestRate / 5) * 5
    : Number(rawGuestRate.toFixed(2));

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !pickerOpen) onClose();
        }}
      >
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-[34rem]">
          <DialogHeader>
            <div className="flex items-start gap-3 border-b px-6 py-5 pr-12 text-left">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <HeaderIcon className="size-5" />
              </span>
              <div>
                <DialogTitle>{editorMeta.title}</DialogTitle>
                <DialogDescription className="mt-0.5">
                  {editorMeta.description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="border-b bg-muted/25 px-6 py-3 text-xs font-medium">
            <span className="flex items-center gap-2">
              <CalendarRange className="size-3.5 text-muted-foreground" />
              {currentRangeText}
            </span>
          </div>

          {state.kind === "availability" ? (
            <div className="space-y-5 p-6">
              <InlineDateScope
                label="What would you like to manage?"
                range={range}
                onOpen={() => setPickerOpen(true)}
              />
              {!isDateScoped ? (
                <>
                  <fieldset>
                    <legend className="text-sm font-semibold">
                      Listing visibility
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
                            <span className="mt-1 block text-xs text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground">
                      Existing reservations remain protected. A hidden listing
                      must be submitted for review again before guests can book
                      it.
                    </p>
                  </div>
                </>
              ) : (
                <>
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
                            description: "Remove manual blocks",
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
                        const selected = availability === option.value;
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setAvailability(option.value)}
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
                            <span className="mt-1 block text-xs text-muted-foreground">
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
                  {availability === "blocked" ? (
                    <div>
                      <Label htmlFor="block-reason">
                        Block reason (optional)
                      </Label>
                      <Input
                        id="block-reason"
                        className="mt-1.5"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="e.g. Maintenance or private stay"
                      />
                    </div>
                  ) : null}
                </>
              )}
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={saveAvailability}
                >
                  {selectedInput
                    ? availability === "blocked"
                      ? "Block dates"
                      : "Make available"
                    : visibility === "hidden"
                      ? "Hide from site"
                      : "Keep visible"}
                </Button>
              </div>
            </div>
          ) : null}

          {state.kind === "price" ? (
            <div className="space-y-5 p-6">
              <InlineDateScope
                label="What price would you like to change?"
                range={range}
                onOpen={() => setPickerOpen(true)}
              />
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
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xl font-semibold text-muted-foreground">
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
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-muted-foreground">
                    per night
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Enter an exact amount or choose a quick adjustment below.
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
                      <span className="text-xs font-semibold">{label}</span>
                      <span
                        className={cn(
                          "mt-0.5 text-[0.65rem]",
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
              <Toggle
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
                  <p className="text-xs font-semibold text-muted-foreground">
                    Additional default settings
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cleaning-fee">Cleaning fee</Label>
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
                      <Label htmlFor="minimum-stay">Minimum nights</Label>
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
                <p className="text-xs text-muted-foreground">
                  {isDateScoped
                    ? "This custom price overrides the default only for the selected dates."
                    : "Existing custom-priced dates remain unchanged. The new default applies everywhere else."}
                </p>
              </div>
              <div className="sticky bottom-0 z-10 -mx-6 -mb-6 border-t bg-background/95 px-6 py-4 shadow-[0_-8px_20px_rgba(0,0,0,0.04)] backdrop-blur">
                <div className="mb-3 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {isDateScoped ? "Default" : "Current default"}{" "}
                    <strong className="text-foreground">
                      €{baseNightlyRate}
                    </strong>
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span className="text-primary">
                    {isDateScoped ? "Custom price" : "New default"}{" "}
                    <strong>€{price || "0"}</strong>
                  </span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="button" disabled={pending} onClick={savePrice}>
                    {isDateScoped
                      ? "Save custom price"
                      : "Save default pricing"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {state.kind === "promotion" ? (
            <div className="space-y-5 p-6">
              <InlineDateScope
                label="When should this promotion apply?"
                range={range}
                onOpen={() => setPickerOpen(true)}
              />
              <fieldset>
                <legend className="text-sm font-semibold">
                  Recommended offers
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
                      <CalendarRange className="size-4 text-primary" />
                      <span className="mt-3 block text-xs font-semibold">
                        {offer.title}
                      </span>
                      <span className="text-[0.65rem] text-muted-foreground">
                        {offer.percent}% · {offer.nights}+ nights
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-xl border bg-primary/5 p-3">
                <Input
                  aria-label="Discount percentage"
                  type="number"
                  min={0}
                  max={50}
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
                <span className="text-xs text-muted-foreground">% off</span>
                <Input
                  aria-label="Promotion minimum stay"
                  type="number"
                  min={1}
                  max={365}
                  value={promotionMinimum}
                  onChange={(event) => setPromotionMinimum(event.target.value)}
                />
                <span className="text-xs text-muted-foreground">nights</span>
              </div>
              <Toggle
                checked={freeCleaning}
                label="Add free cleaning"
                description={`Guests save the €${cleaningFee} cleaning fee on qualifying stays.`}
                onChange={() => setFreeCleaning((current) => !current)}
              />
              {numericDiscount > 0 ? (
                <Toggle
                  checked={roundPromotion}
                  label="Round up to the nearest €5"
                  description="Keeps discounted nightly prices clean."
                  onChange={() => setRoundPromotion((current) => !current)}
                />
              ) : null}
              <div className="flex items-start gap-3 rounded-xl bg-primary/7 p-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                    Guests will see
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {numericDiscount > 0 ? `${numericDiscount}% off` : ""}
                    {numericDiscount > 0 && freeCleaning ? " + " : ""}
                    {freeCleaning ? "free cleaning" : ""}
                    {` · ${promotionMinimum || "0"}+ nights`}
                  </p>
                  {numericDiscount > 0 ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Estimated default-night price: €{guestRate}
                      {roundPromotion
                        ? ` · rounded up from €${Number(rawGuestRate.toFixed(2))}`
                        : ""}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Date-specific offers take priority. Otherwise, the highest
                    qualifying minimum-stay threshold wins.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
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
  locale,
  currency,
  baseNightlyRate,
  cleaningFee,
  minNights,
  datePrices,
  blocks,
  promotions,
}: CalendarWorkspaceProps) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange | undefined>();
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
        target.closest('[role="dialog"], [data-radix-popper-content-wrapper]')
      ) {
        return;
      }
      setRange(undefined);
    }

    document.addEventListener("pointerdown", dismissSelection);
    return () => document.removeEventListener("pointerdown", dismissSelection);
  }, [range?.from]);

  const priceByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of datePrices) {
      map.set(dbDateToYmd(row.date), Number(row.nightlyRate));
    }
    return map;
  }, [datePrices]);

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

  const filteredChanges = changes.filter((change) => {
    if (filter !== "all" && change.kind !== filter) return false;
    if (!change.from || !change.to) return true;
    const from = parseLocalYmd(change.from);
    const to = parseLocalYmd(change.to);
    if (filterFrom && isBefore(to, filterFrom)) return false;
    if (filterTo && isAfter(from, filterTo)) return false;
    return true;
  });

  const selection = range?.from ? calendarRangeToInput(range) : null;

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

  return (
    <div className="space-y-5">
      <section
        ref={calendarInteractionRef}
        aria-label={`${listingTitle} calendar`}
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      >
        <DateRangeCalendarStep
          active
          pagedOnDesktop
          pagedDesktopMonthCount={2}
          selected={range}
          onRangeChange={setRange}
          dayVariant="availability"
          locale={locale}
          dayMeta={(day) => ({
            sublabel: new Intl.NumberFormat("en", {
              style: "currency",
              currency,
              maximumFractionDigits: 0,
            }).format(priceByDate.get(dateKey(day)) ?? baseNightlyRate),
            isCustomPrice: priceByDate.has(dateKey(day)),
          })}
          dateModifiers={{
            manualBlock: (day) => manualDates.has(dateKey(day)),
            bookingHold: (day) => bookingDates.has(dateKey(day)),
            customPrice: (day) => priceByDate.has(dateKey(day)),
            promotion: (day) =>
              promotions.some((promotion) => {
                if (!promotion.startDate || !promotion.endDate) return false;
                return isWithinInterval(day, {
                  start: parseLocalYmd(dbDateToYmd(promotion.startDate)),
                  end: addDays(
                    parseLocalYmd(dbDateToYmd(promotion.endDate)),
                    -1,
                  ),
                });
              }),
          }}
          dateModifiersClassNames={{
            manualBlock:
              "bg-muted after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.09)_0,rgba(15,23,42,0.09)_4px,transparent_4px,transparent_8px)]",
            bookingHold: "bg-destructive/20",
            customPrice: "ring-2 ring-primary/40 ring-inset",
            promotion:
              "before:absolute before:right-1 before:top-1 before:size-1.5 before:rounded-full before:bg-amber-500",
          }}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-2 text-[0.68rem] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-destructive/25" />
            Booked
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-[repeating-linear-gradient(-45deg,rgba(15,23,42,0.18)_0,rgba(15,23,42,0.18)_2px,transparent_2px,transparent_4px)]" />
            Blocked
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500" />
            Promotion
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] border-2 border-primary/50" />
            Custom price
          </span>
        </div>
        <div className="border-t bg-stone-50 px-5 py-3">
          {selection ? (
            <p className="mb-2 text-center text-xs font-medium text-muted-foreground">
              {rangeLabel(selection.startDate, selection.lastDate, true)} ·{" "}
              {selection.nights} {selection.nights === 1 ? "night" : "nights"}
            </p>
          ) : null}
          <div className="mx-auto flex w-full max-w-3xl flex-col justify-center gap-2 sm:flex-row">
            {[
              {
                kind: "availability" as const,
                label: selection ? "Availability" : "Listing availability",
                detail: selection
                  ? "Open or block dates"
                  : "Show or hide listing",
                icon: LockKeyhole,
              },
              {
                kind: "price" as const,
                label: selection ? "Custom price" : "Default price",
                detail: selection
                  ? "Price selected dates"
                  : `Currently €${baseNightlyRate}`,
                icon: CircleDollarSign,
              },
              {
                kind: "promotion" as const,
                label: selection ? "Promotion" : "Create promotion",
                detail: selection
                  ? "Promote selected dates"
                  : "Always active or dated",
                icon: BadgePercent,
              },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.kind}
                  type="button"
                  onClick={() =>
                    setEditor({
                      kind: action.kind,
                      range: range?.from
                        ? { from: range.from, to: range.to ?? range.from }
                        : undefined,
                    })
                  }
                  className="group flex flex-1 items-center gap-3 rounded-xl border bg-background px-3 py-2.5 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-xs font-semibold">
                      {action.label}
                    </span>
                    <span className="block text-[0.65rem] text-muted-foreground">
                      {action.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Scheduled changes</h2>
              <p className="text-xs text-muted-foreground">
                Availability, custom prices, promotions, and protected
                reservations.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {filteredChanges.length} shown
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((item) => {
                const count =
                  item.value === "all"
                    ? changes.length
                    : changes.filter((change) => change.kind === item.value)
                        .length;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={filter === item.value}
                    onClick={() => setFilter(item.value)}
                    onDoubleClick={() => setFilter("all")}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
                  >
                    {item.label} ({count})
                  </button>
                );
              })}
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
            Nothing matches these filters.
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
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.68rem] font-medium">
                    <Icon className="size-3.5" /> {typeLabel}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {change.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {change.detail} · {change.source}
                    </span>
                  </span>
                  {change.kind === "booking" ? (
                    <span className="text-right text-xs text-muted-foreground">
                      Protected reservation
                    </span>
                  ) : (
                    <span className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => editChange(change)}
                      >
                        <Pencil className="size-3.5" /> Edit
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
          state={editor}
          onStateChange={setEditor}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}
