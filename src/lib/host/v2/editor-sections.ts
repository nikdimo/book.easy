import { MIN_PUBLISH_PHOTOS } from "@/lib/host/v2/photo-draft";

/**
 * The editor's left navigation.
 *
 * One list, shared by the desktop rail, the phone chip row, the section footer and the
 * Overview screen, so none of them can drift. Sections are grouped the way a host thinks
 * about the work: what a stay costs and when it can be had, and what the listing says.
 *
 * There is no "Open calendar" entry any more. It was a rail row that left the editor
 * without saying what for, sitting above the two sections that now *own* the settings a
 * host went looking for; the calendar is reached from inside Rates & availability, from
 * links that name the date-specific job they lead to. The header's overflow menu keeps
 * one global escape hatch for hosts who simply want the calendar.
 *
 * Overview is a navigation item rather than a section — it is the editor's own index
 * page — so it is declared beside the sections instead of inside them. That keeps
 * `EDITOR_SECTIONS` meaning exactly "a page that edits part of this listing", which is
 * what completion counting and the section footer both need it to mean.
 */
export interface EditorSection {
  slug: string;
  /** UI catalog key for the label. */
  key: string;
  /** English source text, and the fallback when nothing is translated. */
  source: string;
  /** Whether this section can be finished at all — that is, whether the database holds
   *  a fact that says so. Only such a section can be reported as an open task; one
   *  without a stored answer (Amenities, Arrival guide) is never chased. */
  completion: boolean;
  group: "calendar" | "details";
  /**
   * Which half of the editor this section belongs to.
   *
   * The editor is two things, not one list: what you are selling ("Your space") and what
   * happens once somebody has bought it ("Arrival guide"). Airbnb splits them at the top
   * level and so do we — see `EditorHalves`.
   *
   * It matters here rather than only in the components because the split has to be the
   * same fact everywhere: the rail, the phone chip row, the "what next" footer and the
   * overview's section list all read this module, and a half declared in one of them
   * would eventually disagree with the other three.
   */
  half: EditorHalf;
}

/** The two halves of the editor. `space` is the default for everything that describes
 *  the property itself. */
export type EditorHalf = "space" | "arrival";

export const EDITOR_SECTIONS: EditorSection[] = [
  // Availability edits one persisted default that every listing already has, so there
  // is no state in which it is "unfinished" — it is never counted or chased. Pricing
  // is the same for completion purposes; a listing with no pricing rule at all is
  // flagged separately by `editorAttentionItems`, which is a blocked sale rather than
  // an unfinished form.
  { slug: "availability", key: "host.editor.section.availability", source: "Availability", completion: false, group: "calendar", half: "space" },
  { slug: "pricing", key: "host.editor.section.pricing", source: "Pricing", completion: false, group: "calendar", half: "space" },
  { slug: "photos", key: "host.editor.section.photos", source: "Photos", completion: true, group: "details", half: "space" },
  { slug: "basics", key: "host.editor.section.basics", source: "Title & description", completion: true, group: "details", half: "space" },
  { slug: "rooms", key: "host.editor.section.rooms", source: "Property details", completion: true, group: "details", half: "space" },
  { slug: "location", key: "host.editor.section.location", source: "Location", completion: true, group: "details", half: "space" },
  // Amenities are optional at publish time. Without a persisted "reviewed" marker,
  // zero selected amenities cannot be distinguished from an unfinished section, so it
  // must not create a false warning the host has no way to clear.
  { slug: "amenities", key: "host.editor.section.amenities", source: "Amenities", completion: false, group: "details", half: "space" },
  // Payment arrangements has an explicit reviewed marker. It stays in attention until
  // the host deliberately saves either accepted method names or Arrange directly.
  { slug: "payment-arrangements", key: "host.editor.section.payment_arrangements", source: "Payment arrangements", completion: true, group: "details", half: "space" },
  // House rules counts because it has a persisted "reviewed" state of its own
  // (`Listing.houseRulesReviewedAt`): "unanswered" is a fact the database holds rather
  // than an inference from fields that always have values.
  { slug: "house-rules", key: "host.editor.section.house_rules", source: "House rules", completion: true, group: "details", half: "space" },
  // Arrival guide does now have a reviewed marker of its own
  // (`ListingArrivalGuide.reviewedAt`), so it *could* be counted — and is deliberately
  // not. Nothing in it is required to publish or to take a booking: a host who lets guests
  // in personally has no door code, no Wi-Fi to share and no manual to write, and has
  // finished the section by not filling it in. Counting it would put a permanent warning
  // flag on their listing for a question they have already answered by living there.
  { slug: "arrival-guide", key: "host.editor.section.arrival_guide", source: "Arrival guide", completion: false, group: "details", half: "arrival" },
];

/** The editor's index page. It lives on the base route, not on a slug of its own. */
export const EDITOR_OVERVIEW_SLUG = "overview";

/** The Arrival guide's own slug, named because three modules need to talk about the
 *  other half by something other than a bare string. */
export const ARRIVAL_GUIDE_SLUG = "arrival-guide";

/**
 * The sections the "Your space" half is made of — everything the rail, the chip row, the
 * section footer and the overview's list are about.
 *
 * The Arrival guide is deliberately absent. It is not a section among sections any more:
 * it is the editor's other half, reached by the toggle above both columns rather than by
 * a row at the bottom of a list of nine. It stays in `EDITOR_SECTIONS` because it is still
 * a real page with a real slug — `findEditorSection` and `editorSectionFromPathname` both
 * have to keep recognising it, or the header's listing switcher would drop a host onto the
 * overview every time they changed property from inside it.
 */
export const EDITOR_SPACE_SECTIONS = EDITOR_SECTIONS.filter(
  (section) => section.half === "space",
);

export const EDITOR_COMPLETION_SECTIONS = EDITOR_SECTIONS.filter((section) => section.completion);

/** Completion facts shared by every route. Keeping this pure prevents a section's
 * mark from appearing or vanishing merely because the host navigated elsewhere. */
export function editorCompletedSections(input: {
  photoCount: number;
  basicsComplete: boolean;
  propertyDetailsComplete: boolean;
  locationComplete: boolean;
  /** Whether the host has saved the House rules section — `houseRulesReviewedAt` is
   *  not null. Never inferred from the rules having values: they always do. */
  houseRulesReviewed: boolean;
  /** Whether the host has deliberately saved Payment arrangements. */
  paymentMethodsReviewed: boolean;
}): string[] {
  return [
    ...(input.photoCount >= MIN_PUBLISH_PHOTOS ? ["photos"] : []),
    ...(input.basicsComplete ? ["basics"] : []),
    ...(input.propertyDetailsComplete ? ["rooms"] : []),
    ...(input.locationComplete ? ["location"] : []),
    ...(input.paymentMethodsReviewed ? ["payment-arrangements"] : []),
    ...(input.houseRulesReviewed ? ["house-rules"] : []),
  ];
}

export function findEditorSection(slug: string): EditorSection | undefined {
  return EDITOR_SECTIONS.find((section) => section.slug === slug);
}

/** `/host/listings/<id>` for Overview, `/host/listings/<id>/<slug>` otherwise. */
export function editorSectionHref(listingId: string, slug: string): string {
  const base = `/host/listings/${listingId}`;
  return slug === EDITOR_OVERVIEW_SLUG ? base : `${base}/${slug}`;
}

/**
 * Which section a URL is on, read from the path rather than from a fixed segment index.
 *
 * The header's listing switcher needs this so that changing property keeps the host on
 * the page they were reading. Counting segments got it wrong: the public route is
 * `/host/listings/<id>/<slug>`, so the slug is the *fourth* segment, but the route files
 * still live under `/host/v2/listings/...` and `next.config.ts` rewrites between the two
 * — which means the segment index depends on whether the pathname being read is the
 * browser's or the rewrite's destination. Anchoring on `listings/<id>/` instead is true
 * of both, so the answer cannot depend on which one `usePathname` happened to hand back.
 *
 * An unrecognised slug is Overview rather than itself: the switcher builds an href from
 * whatever comes out of here, and a slug no section claims would send the host to the
 * catch-all's 404 on a listing they can perfectly well edit.
 */
export function editorSectionFromPathname(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const listingsIndex = segments.lastIndexOf("listings");
  if (listingsIndex === -1) return EDITOR_OVERVIEW_SLUG;
  // listings / <id> / <slug>
  const slug = segments[listingsIndex + 2];
  return slug && findEditorSection(slug) ? slug : EDITOR_OVERVIEW_SLUG;
}

/**
 * One navigation entry.
 *
 * `slug` is what marks the entry active, and matches the section slug wherever the
 * entry is a section. Every entry is a page of the editor: nothing in this navigation
 * leaves it any more, so an entry can always be highlighted for the page it names.
 */
export interface EditorNavItem {
  slug: string;
  key: string;
  source: string;
  href: (listingId: string) => string;
}

export interface EditorNavGroup {
  id: "overview" | "calendar" | "details";
  key: string;
  source: string;
  items: EditorNavItem[];
}

function sectionNavItem(section: EditorSection): EditorNavItem {
  return {
    slug: section.slug,
    key: section.key,
    source: section.source,
    href: (listingId) => editorSectionHref(listingId, section.slug),
  };
}

export const EDITOR_OVERVIEW_ITEM: EditorNavItem = {
  slug: EDITOR_OVERVIEW_SLUG,
  key: "host.editor.section.overview",
  source: "Listing overview",
  href: (listingId) => editorSectionHref(listingId, EDITOR_OVERVIEW_SLUG),
};

/**
 * The navigation, in the order the rail renders it.
 *
 * Derived from `EDITOR_SECTIONS` rather than restated, so adding a section puts it in
 * the rail, the overview and the footer at once.
 */
export const EDITOR_NAV_GROUPS: EditorNavGroup[] = [
  {
    id: "overview",
    key: "host.editor.nav.group_overview",
    source: "Overview",
    items: [EDITOR_OVERVIEW_ITEM],
  },
  {
    // The id stays `calendar` on purpose. It is what marks the group in the rail, the
    // overflow menu and the Overview cards, and renaming it would touch every one of
    // them to change a word only the host reads. The label is the part that moved:
    // these two pages set what a stay costs and when it can be had, and calling them
    // "Calendar settings" sent hosts to the calendar looking for a base price.
    id: "calendar",
    key: "host.editor.nav.group_rates",
    source: "Rates & availability",
    items: EDITOR_SPACE_SECTIONS.filter((section) => section.group === "calendar").map(
      sectionNavItem,
    ),
  },
  {
    id: "details",
    key: "host.editor.nav.group_details",
    source: "Listing details",
    items: EDITOR_SPACE_SECTIONS.filter((section) => section.group === "details").map(sectionNavItem),
  },
];

/** Every navigation entry in rail order — what the phone chip row windows over. */
export const EDITOR_NAV_ITEMS: EditorNavItem[] = EDITOR_NAV_GROUPS.flatMap(
  (group) => group.items,
);
