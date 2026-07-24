"use client";

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { pluralText } from "@/lib/i18n/client";
import { useSearchLabels } from "@/components/marketplace/search-labels";
import type { SearchLabels } from "@/components/marketplace/search-labels";
import type { Resolved } from "@/lib/i18n/t";

type Layout = "pill" | "hero" | "compact";

export type GuestCounts = {
  adults: number;
  children: number;
  infants: number;
  pets: number;
};

function totalParty(c: GuestCounts) {
  return c.adults + c.children;
}

export function formatGuestSummary(c: GuestCounts, labels: SearchLabels): Resolved {
  const guestTotal = totalParty(c);
  const parts: Resolved[] = [];

  if (guestTotal > 0) {
    parts.push(pluralText(labels.guest, guestTotal, labels.locale));
  }
  if (c.infants > 0) {
    parts.push(pluralText(labels.infant, c.infants, labels.locale));
  }
  if (c.pets > 0) {
    parts.push(pluralText(labels.pet, c.pets, labels.locale));
  }

  if (parts.length === 0) return labels.addGuests;
  return {
    text: parts.map((p) => p.text).join(", "),
    translated: parts.every((p) => p.translated),
  };
}

/**
 * Just the "Who" trigger — clicking it opens the same dialog/step that
 * MarketplaceStayDatePicker uses for its own guests step (via onOpenRequest), so there is
 * only one guest-editing surface instead of a second, separately-shelled popover.
 */
export function MarketplaceGuestSelector({
  layout,
  value,
  active = false,
  onOpenRequest,
  className,
}: {
  layout: Layout;
  value: GuestCounts;
  active?: boolean;
  onOpenRequest: () => void;
  className?: string;
}) {
  const labels = useSearchLabels();
  const summary = formatGuestSummary(value, labels);
  const triggerActive = active;

  const pillClass = cn(
    "flex min-w-0 items-center rounded-full px-6 py-2.5 text-left outline-none transition-[background-color,box-shadow,transform] duration-200 ease-out",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    triggerActive
      ? "bg-white shadow-[0_2px_10px_rgba(15,23,42,0.12)]"
      : "hover:bg-black/[0.035]"
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

  return layout === "pill" ? (
    <button
      type="button"
      className={cn(pillClass, className)}
      aria-expanded={active}
      aria-haspopup="dialog"
      onClick={onOpenRequest}
    >
      <span className="min-w-0 flex-1 text-left">
          <span
          className={cn(
            "block text-[0.72rem] font-semibold leading-4 text-foreground",
            labels.who.translated && "notranslate"
          )}
        >
          {labels.who.text}
        </span>
        <span
          className={cn(
            "mt-px block truncate text-sm leading-5 font-normal",
            totalParty(value) === 0 && "text-muted-foreground",
            summary.translated && "notranslate"
          )}
        >
          {summary.text}
        </span>
      </span>
    </button>
  ) : (
    <button
      type="button"
      className={cn(heroClass, className)}
      aria-expanded={active}
      aria-haspopup="dialog"
      onClick={onOpenRequest}
    >
      <Users className="h-5 w-5 text-muted-foreground shrink-0 hidden sm:block" />
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "text-xs font-semibold tracking-wide block",
            labels.who.translated && "notranslate"
          )}
        >
          {labels.who.text}
        </span>
        <span
          className={cn(
            "text-sm md:text-base font-medium",
            totalParty(value) === 0 && "text-muted-foreground",
            summary.translated && "notranslate"
          )}
        >
          {summary.text}
        </span>
      </div>
    </button>
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

/**
 * Full adults/children/infants/pets breakdown as separate query params, so a search
 * carries its exact composition through the URL instead of collapsing to a single
 * "guests" total that `guestsParamToCounts` can only re-expand as all-adults.
 */
export function guestCountsToParams(c: GuestCounts): Record<string, string> {
  const out: Record<string, string> = {};
  if (c.adults > 0) out.adults = String(c.adults);
  if (c.children > 0) out.children = String(c.children);
  if (c.infants > 0) out.infants = String(c.infants);
  if (c.pets > 0) out.pets = String(c.pets);
  return out;
}

/** Reads the breakdown params back; returns null when none are present (e.g. a link
 * that only carries the plain `guests` total), so callers can fall back appropriately. */
export function guestCountsFromParams(
  get: (key: string) => string | null
): GuestCounts | null {
  const raw = {
    adults: get("adults"),
    children: get("children"),
    infants: get("infants"),
    pets: get("pets"),
  };
  if (Object.values(raw).every((v) => v === null)) return null;

  const toCount = (v: string | null) => {
    const n = Number.parseInt(v ?? "", 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return {
    adults: toCount(raw.adults),
    children: toCount(raw.children),
    infants: toCount(raw.infants),
    pets: toCount(raw.pets),
  };
}
