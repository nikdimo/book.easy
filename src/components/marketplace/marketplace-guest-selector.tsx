"use client";

import * as React from "react";
import { Minus, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Layout = "pill" | "hero" | "compact";

export type GuestCounts = {
  adults: number;
  children: number;
  infants: number;
  pets: number;
};

const MAX_PER_CATEGORY = 16;

function StepperRow({
  title,
  subtitle,
  value,
  onChange,
  min = 0,
  max = MAX_PER_CATEGORY,
  subtitleExtra,
}: {
  title: string;
  subtitle: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  subtitleExtra?: React.ReactNode;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-1 last:pb-1">
      <div className="min-w-0 pr-2">
        <p className="font-semibold text-foreground">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        {subtitleExtra ? <div className="mt-1">{subtitleExtra}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/80 text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-35"
          )}
          aria-label={`Decrease ${title}`}
        >
          <Minus className="h-4 w-4" strokeWidth={2} />
        </button>
        <span className="min-w-[1.25rem] text-center text-sm font-semibold tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/80 text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-35"
          )}
          aria-label={`Increase ${title}`}
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function totalParty(c: GuestCounts) {
  return c.adults + c.children;
}

function summaryLabel(c: GuestCounts): string {
  const n = totalParty(c);
  if (n === 0) return "Add guests";
  if (n === 1) return "1 guest";
  return `${n} guests`;
}

export function MarketplaceGuestSelector({
  layout,
  value,
  onChange,
  open: controlledOpen,
  onOpenChange,
  className,
}: {
  layout: Layout;
  value: GuestCounts;
  onChange: (next: GuestCounts) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const triggerActive = open;

  const pillClass = cn(
    "flex items-center gap-2 min-w-0 px-3 py-1.5 text-left rounded-full outline-none transition-all duration-200 ease-out",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    triggerActive
      ? "bg-background shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
      : "hover:bg-muted/25"
  );

  const heroClass = cn(
    "flex items-center gap-3 cursor-pointer text-left outline-none transition-all duration-200 ease-out",
    layout === "compact"
      ? "rounded-[1.6rem] border px-4 py-4 md:rounded-r-full md:border-0 md:py-2.5"
      : "px-4 py-3 md:py-4 md:px-6 md:min-w-[140px] md:rounded-r-full",
    triggerActive
      ? "border-border/70 bg-background rounded-[1.6rem] shadow-[0_10px_24px_rgba(15,23,42,0.08)] md:rounded-2xl"
      : layout === "compact"
        ? "border-transparent bg-transparent hover:border-border/60 hover:bg-muted/25"
        : "hover:bg-muted/25"
  );

  const set = (patch: Partial<GuestCounts>) =>
    onChange({ ...value, ...patch });

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        {layout === "pill" ? (
          <button
            type="button"
            className={cn(pillClass, className)}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <Users className="h-4 w-4 text-muted-foreground shrink-0 hidden md:block" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:text-[11px]">
                Who
              </span>
              <span
                className={cn(
                  "block text-sm font-medium truncate",
                  totalParty(value) === 0 && "text-muted-foreground"
                )}
              >
                {summaryLabel(value)}
              </span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            className={cn(heroClass, className)}
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <Users className="h-5 w-5 text-muted-foreground shrink-0 hidden sm:block" />
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold tracking-wide block">
                Who
              </span>
              <span
                className={cn(
                  "text-sm md:text-base font-medium",
                  totalParty(value) === 0 && "text-muted-foreground"
                )}
              >
                {summaryLabel(value)}
              </span>
            </div>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        collisionPadding={16}
        className={cn(
          "w-[min(100vw-1.5rem,22rem)] rounded-3xl border border-border/60 bg-background p-0 shadow-xl ring-0",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-4 py-2 divide-y divide-border">
          <StepperRow
            title="Adults"
            subtitle="Ages 13 or above"
            value={value.adults}
            onChange={(adults) => set({ adults })}
            min={0}
          />
          <StepperRow
            title="Children"
            subtitle="Ages 2 – 12"
            value={value.children}
            onChange={(children) => set({ children })}
          />
          <StepperRow
            title="Infants"
            subtitle="Under 2"
            value={value.infants}
            onChange={(infants) => set({ infants })}
          />
          <StepperRow
            title="Pets"
            subtitle=""
            value={value.pets}
            onChange={(pets) => set({ pets })}
            subtitleExtra={
              <button
                type="button"
                className="mt-1 block text-left text-sm font-normal text-foreground underline underline-offset-2 hover:text-foreground/80"
              >
                Bringing a service animal?
              </button>
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Parse `guests` URL param into counts (all adults by default). */
export function guestsParamToCounts(guestsParam: string): GuestCounts {
  const n = Number.parseInt(guestsParam, 10);
  if (!Number.isFinite(n) || n < 1) {
    return { adults: 0, children: 0, infants: 0, pets: 0 };
  }
  return { adults: n, children: 0, infants: 0, pets: 0 };
}

/** Map counts to `guests` query value (adults + children only). */
export function countsToGuestsParam(c: GuestCounts): string {
  const n = totalParty(c);
  return n > 0 ? String(n) : "";
}
