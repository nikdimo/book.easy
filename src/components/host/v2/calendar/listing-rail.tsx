"use client";

import { useI18n } from "@/lib/i18n/client";
import { CALENDAR_ANCHOR } from "@/lib/host/v2/calendar-anchors";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import type { HostListingStatusSummary } from "@/lib/host/v2/listing-status";
import {
  ALL_ENTITIES,
  EntityChooserSheet,
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

export function ListingRail({
  entries,
  selectedId,
  compact,
  onSelect,
  onToggleCompact,
}: {
  entries: RailEntry[];
  selectedId: string;
  compact: boolean;
  onSelect: (id: string) => void;
  onToggleCompact: () => void;
}) {
  const i18n = useI18n();
  const items = useRailItems(entries);

  return (
    <EntityRail
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
