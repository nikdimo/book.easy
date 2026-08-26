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

  for (const section of EDITOR_COMPLETION_SECTIONS) {
    if (done.has(section.slug)) continue;
    const reason = INCOMPLETE_REASON[section.slug];
    if (!reason) continue;
    items.push({ slug: section.slug, key: reason.key, source: reason.source });
  }

  return items;
}
