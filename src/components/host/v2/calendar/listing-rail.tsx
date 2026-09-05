"use client";

import { Check, X } from "lucide-react";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { CALENDAR_ANCHOR } from "@/lib/host/v2/calendar-anchors";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import type { HostListingStatusSummary } from "@/lib/host/v2/listing-status";
import {
  ALL_ENTITIES,
  EntityChooserSheet,
  EntityMultiSelectSheet,
  EntityRail,
  type RailItem,
} from "@/components/host/v2/entity-rail";
import {
  attentionReason,
  bookabilityLine,
  needsAttentionLabel,
} from "./calendar-labels";

/**
 * The calendar's property column.
 *
 * The rail itself is `EntityRail`, shared with the reservations panel; what lives here
 * is the calendar's own vocabulary — whether a property can actually be booked, and
 * what is stopping it. That translation is the whole job of this file.
 */

export const ALL_LISTINGS = ALL_ENTITIES;

export interface RailEntry {
  listing: HostCalendarListing;
  summary: HostListingStatusSummary;
}

/** Turns a listing and its bookability summary into the lines the rail draws. */
function useRailItems(entries: RailEntry[]): RailItem[] {
  const i18n = useI18n();
  const attentionLabel = needsAttentionLabel(i18n);

  return entries.map((entry) => {
    const attention = attentionReason(i18n, entry.summary);
    return {
      id: entry.listing.id,
      title: entry.listing.title,
      photoUrl: entry.listing.photoUrl,
      photoAlt: entry.listing.photoAlt,
      tone: entry.summary.tone,
      attention: attention
        ? { label: attentionLabel, detail: attention }
        : null,
      status: bookabilityLine(i18n, entry.summary),
    };
  });
}

/**
 * Everything the rail needs while the host is aiming an availability change at more
 * than one property. Held by the workspace; the rail only draws it.
 */
export interface ListingMultiSelect {
  /** Extra properties, never including the one on screen. */
  checkedIds: string[];
  /** The property whose grid the dates were chosen on. */
  lockedId: string;
  /** Every property that would be written, including the locked one. */
  total: number;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearExtras: () => void;
  onExit: () => void;
}

/**
 * The mode saying what it is, above the list it has taken over.
 *
 * Without it the rail is a set of checkboxes with no sentence attached, and a host who
 * looks away and back has no way to tell why the properties stopped navigating.
 */
function MultiSelectBanner({
  total,
  allChecked,
  onSelectAll,
  onClearExtras,
  onExit,
}: {
  total: number;
  allChecked: boolean;
  onSelectAll: () => void;
  onClearExtras: () => void;
  onExit: () => void;
}) {
  const i18n = useI18n();
  return (
    <div className="shrink-0 rounded-xl bg-[#0f172a] px-2.5 py-2 text-white">
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 flex-1">
          <span className="block text-[0.625rem] font-bold uppercase tracking-wider text-white/55">
            {
              i18n.resolve(
                "host.v2.calendar.multi_banner_label",
                "Blocking on",
              ).text
            }
          </span>
          <span className="mt-0.5 block truncate text-[0.8125rem] font-semibold tabular-nums">
            {
              interpolate(
                i18n.plural(
                  "host.v2.calendar.multi_target_count",
                  total,
                  "{n} property",
                  "{n} properties",
                ),
                {},
              ).text
            }
          </span>
        </p>
        <button
          type="button"
          onClick={onExit}
          aria-label={
            i18n.resolve(
              "host.v2.calendar.multi_exit",
              "Just this property",
            ).text
          }
          title={
            i18n.resolve(
              "host.v2.calendar.multi_exit",
              "Just this property",
            ).text
          }
          className="-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <button
        type="button"
        onClick={allChecked ? onClearExtras : onSelectAll}
        className="mt-1.5 flex min-h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 text-[0.75rem] font-semibold text-white transition-colors duration-150 hover:bg-white/20 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Check className="size-3.5 shrink-0" aria-hidden />
        {allChecked
          ? i18n.resolve("host.v2.calendar.multi_clear", "Only this one").text
          : i18n.resolve("host.v2.calendar.rail_select_all", "Select all").text}
      </button>
    </div>
  );
}

export function ListingRail({
  entries,
  selectedId,
  compact,
  multiSelect,
  onSelect,
  onToggleCompact,
}: {
  entries: RailEntry[];
  selectedId: string;
  compact: boolean;
  multiSelect?: ListingMultiSelect | null;
  onSelect: (id: string) => void;
  onToggleCompact: () => void;
}) {
  const i18n = useI18n();
  const items = useRailItems(entries);
  const allChecked = multiSelect
    ? multiSelect.total >= entries.length
    : false;

  return (
    <EntityRail
      multiSelect={
        multiSelect
          ? {
              checkedIds: multiSelect.checkedIds,
              lockedId: multiSelect.lockedId,
              onToggle: multiSelect.onToggle,
              banner: (
                <MultiSelectBanner
                  total={multiSelect.total}
                  allChecked={allChecked}
                  onSelectAll={multiSelect.onSelectAll}
                  onClearExtras={multiSelect.onClearExtras}
                  onExit={multiSelect.onExit}
                />
              ),
            }
          : null
      }
      heading={i18n.resolve("host.v2.calendar.rail_heading", "Properties").text}
      ariaLabel={
        i18n.resolve("host.v2.calendar.rail_label", "Your properties").text
      }
      items={items}
      allCard={{
        label: i18n.resolve("host.v2.calendar.all_listings", "All listings"),
        detail: { text: String(entries.length) },
      }}
      selectedId={selectedId}
      compact={compact}
      onSelect={onSelect}
      onToggleCompact={onToggleCompact}
      anchor={CALENDAR_ANCHOR.listingRail}
      selectedAnchor={CALENDAR_ANCHOR.selectedListing}
    />
  );
}

export function ListingChooserSheet({
  open,
  entries,
  selectedId,
  onSelect,
  onOpenChange,
}: {
  open: boolean;
  entries: RailEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const i18n = useI18n();
  const items = useRailItems(entries);

  return (
    <EntityChooserSheet
      open={open}
      title={i18n.resolve("host.v2.calendar.chooser_title", "Choose a property")}
      items={items}
      allCard={{
        label: i18n.resolve("host.v2.calendar.all_listings", "All listings"),
        detail: { text: String(entries.length) },
      }}
      selectedId={selectedId}
      onSelect={onSelect}
      onOpenChange={onOpenChange}
      anchor={CALENDAR_ANCHOR.listingChooser}
    />
  );
}

/**
 * The rail's checkbox mode, for a screen that has no rail.
 *
 * Same cards, same vocabulary, same locked property — only the container differs,
 * which is the same trade the workspace already makes between its desktop editor
 * column and its mobile drawer.
 */
export function ListingMultiSelectSheet({
  open,
  entries,
  multiSelect,
  rangeLabel,
  onOpenChange,
}: {
  open: boolean;
  entries: RailEntry[];
  multiSelect: ListingMultiSelect;
  /** The dates being aimed at, so the set is never chosen blind. */
  rangeLabel: string;
  onOpenChange: (open: boolean) => void;
}) {
  const i18n = useI18n();
  const items = useRailItems(entries);

  return (
    <EntityMultiSelectSheet
      open={open}
      title={i18n.resolve(
        "host.v2.calendar.multi_sheet_title",
        "Block on more properties",
      )}
      subtitle={{ text: rangeLabel, translated: true }}
      items={items}
      lockedId={multiSelect.lockedId}
      checkedIds={multiSelect.checkedIds}
      selectAllLabel={
        i18n.resolve("host.v2.calendar.rail_select_all", "Select all").text
      }
      clearLabel={
        i18n.resolve("host.v2.calendar.multi_clear", "Only this one").text
      }
      doneLabel={
        interpolate(
          i18n.plural(
            "host.v2.calendar.multi_sheet_done",
            multiSelect.total,
            "Done · {n} property",
            "Done · {n} properties",
          ),
          {},
        ).text
      }
      onToggle={multiSelect.onToggle}
      onSelectAll={multiSelect.onSelectAll}
      onClearExtras={multiSelect.onClearExtras}
      onOpenChange={onOpenChange}
      anchor={CALENDAR_ANCHOR.listingMultiSelect}
    />
  );
}
