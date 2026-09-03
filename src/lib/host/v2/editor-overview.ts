import { EDITOR_COMPLETION_SECTIONS } from "@/lib/host/v2/editor-sections";
import { MIN_PUBLISH_PHOTOS } from "@/lib/host/v2/photo-draft";

/**
 * What the Listing overview says needs attention.
 *
 * Every item here is derived from a fact the database already holds and the rest of the
 * editor already agrees on: the shared completion set (`editorCompletedSections`), and
 * whether a pricing rule exists at all. Nothing is invented from optional data — an
 * arrival guide the host has not written, an area name they left blank, a promotion
 * they never wanted are all legitimate states and none of them appear here.
 *
 * Keeping it pure means the overview cannot develop its own idea of "done" that
 * contradicts the checkmarks in the rail two inches to its left.
 */

export interface EditorOverviewFacts {
  /** Straight from `editorCompletedSections` — the same array the rail ticks. */
  completeSections: readonly string[];
  /** Whether the listing has a pricing rule. Without one no date can be booked, which
   *  is a blocked sale rather than a matter of taste. */
  hasPricing: boolean;
  /** False only when Weekly is active but its day or whole-week limits make every
   *  possible stay invalid. This is an availability task, not an optional preference. */
  bookingRulesReady?: boolean;
  /** A saved panorama and camera direction. Optional at publish time, but explicitly
   * checked afterwards so guests receive a useful approach view near check-in. */
  streetViewSet?: boolean;
}

export interface EditorAttentionItem {
  /** The editor section that fixes it. */
  slug: string;
  /** UI catalog key for the one-line reason. */
  key: string;
  source: string;
}

/** Why each unfinished section matters, in the host's terms rather than the schema's. */
const INCOMPLETE_REASON: Record<string, { key: string; source: string }> = {
  photos: {
    key: "host.editor.overview.attention.photos",
    source: `Add at least ${MIN_PUBLISH_PHOTOS} photos before publishing.`,
  },
  basics: {
    key: "host.editor.overview.attention.basics",
    source: "The title or the description still needs work.",
  },
  rooms: {
    key: "host.editor.overview.attention.rooms",
    source: "Property details are incomplete.",
  },
  location: {
    key: "host.editor.overview.attention.location",
    source: "The address or the map pin is incomplete.",
  },
  "payment-arrangements": {
    key: "host.editor.overview.attention.payment_arrangements",
    source: "Choose accepted payment methods and whether a deposit is required.",
  },
  "house-rules": {
    key: "host.editor.overview.attention.house_rules",
    source: "House rules have not been reviewed.",
  },
};

const NO_PRICING: EditorAttentionItem = {
  slug: "pricing",
  key: "host.editor.overview.attention.pricing",
  source: "No nightly price is set, so no date can be booked.",
};

const BOOKING_RULES_INCOMPLETE: EditorAttentionItem = {
  slug: "availability",
  key: "host.editor.overview.attention.booking_rules",
  source: "Finish the weekly booking rules before guests can choose dates.",
};

const STREET_VIEW_UNCHECKED: EditorAttentionItem = {
  slug: "location",
  key: "host.editor.overview.attention.street_view",
  source: "Check Street View and point it at the approach guests should use.",
};

/**
 * The listing's real open tasks, most consequential first.
 *
 * A missing price leads: it stops every booking outright, whereas an unfinished section
 * only makes the listing less convincing.
 */
export function editorAttentionItems(
  facts: EditorOverviewFacts,
): EditorAttentionItem[] {
  const done = new Set(facts.completeSections);
  const items: EditorAttentionItem[] = [];

  if (!facts.hasPricing) items.push(NO_PRICING);
  if (facts.bookingRulesReady === false) items.push(BOOKING_RULES_INCOMPLETE);

  for (const section of EDITOR_COMPLETION_SECTIONS) {
    if (done.has(section.slug)) {
      if (section.slug === "location" && facts.streetViewSet === false) {
        items.push(STREET_VIEW_UNCHECKED);
      }
      continue;
    }
    const reason = INCOMPLETE_REASON[section.slug];
    if (!reason) continue;
    items.push({ slug: section.slug, key: reason.key, source: reason.source });
  }

  return items;
}

/**
 * The same open tasks, as bare slugs — what the navigation marks.
 *
 * The rail flags a section that wants something rather than ticking one that is
 * finished, so "no mark" carries a single meaning: nothing to do here. Ticks could not
 * say that, because a section with no persisted reviewed state (Amenities, Arrival
 * guide) is untickable and looked identical to one the host still owed an answer.
 * It also lets Pricing be marked at all: a listing with no nightly price cannot be
 * booked, and no checkmark could ever have shown that.
 */
export function editorAttentionSlugs(facts: EditorOverviewFacts): string[] {
  return editorAttentionItems(facts).map((item) => item.slug);
}
