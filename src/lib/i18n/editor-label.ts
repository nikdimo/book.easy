import type { Resolved } from "@/lib/i18n/t";

interface TranslationResolver {
  resolve(key: string, source: string): Resolved;
}

/**
 * Every label the listing editor's navigation and overview carry as data.
 *
 * Section names, group headings and the overview's attention reasons all live in
 * `editor-sections.ts` and `editor-overview.ts` as plain objects, so the components that
 * render them call `resolve(item.key, item.source)` with variables. The string extractor
 * only sees literal calls, which meant most of the rail's labels never reached the
 * catalog at all and fell back to English however the host had set their language.
 *
 * Declaring them here — one literal call per key, the same shape `status-labels.ts`
 * already uses for listing and booking statuses — puts them in the catalog without
 * giving the navigation a second source of truth: the switch decides nothing, the data
 * still does. `editor-label.test.ts` fails if the two ever disagree, or if a new
 * navigation item arrives without a declaration.
 *
 * Anything undeclared still resolves, using the caller's own source text. A missing
 * declaration costs a translation, never a blank label.
 */
export function resolveEditorLabel(
  translator: TranslationResolver,
  key: string,
  source: string,
): Resolved {
  switch (key) {
    // Navigation groups.
    case "host.editor.nav.group_overview": return translator.resolve("host.editor.nav.group_overview", "Overview");
    case "host.editor.calendar_settings": return translator.resolve("host.editor.calendar_settings", "Calendar settings");
    case "host.editor.nav.group_details": return translator.resolve("host.editor.nav.group_details", "Listing details");

    // Navigation items.
    case "host.editor.section.overview": return translator.resolve("host.editor.section.overview", "Listing overview");
    case "host.editor.nav.open_calendar": return translator.resolve("host.editor.nav.open_calendar", "Open calendar");
    case "host.editor.section.availability": return translator.resolve("host.editor.section.availability", "Availability");
    case "host.editor.section.pricing": return translator.resolve("host.editor.section.pricing", "Pricing");
    case "host.editor.section.photos": return translator.resolve("host.editor.section.photos", "Photos");
    case "host.editor.section.basics": return translator.resolve("host.editor.section.basics", "Title & description");
    case "host.editor.section.rooms": return translator.resolve("host.editor.section.rooms", "Property details");
    case "host.editor.section.location": return translator.resolve("host.editor.section.location", "Location");
    case "host.editor.section.amenities": return translator.resolve("host.editor.section.amenities", "Amenities");
    case "host.editor.section.house_rules": return translator.resolve("host.editor.section.house_rules", "House rules");
    case "host.editor.section.arrival_guide": return translator.resolve("host.editor.section.arrival_guide", "Arrival guide");

    // Overview attention reasons.
    case "host.editor.overview.attention.pricing": return translator.resolve("host.editor.overview.attention.pricing", "No nightly price is set, so no date can be booked.");
    case "host.editor.overview.attention.photos": return translator.resolve("host.editor.overview.attention.photos", "Add at least 3 photos before publishing.");
    case "host.editor.overview.attention.basics": return translator.resolve("host.editor.overview.attention.basics", "The title or the description still needs work.");
    case "host.editor.overview.attention.rooms": return translator.resolve("host.editor.overview.attention.rooms", "Property details are incomplete.");
    case "host.editor.overview.attention.location": return translator.resolve("host.editor.overview.attention.location", "The address or the map pin is incomplete.");
    case "host.editor.overview.attention.house_rules": return translator.resolve("host.editor.overview.attention.house_rules", "House rules have not been reviewed.");

    default:
      return translator.resolve(key, source);
  }
}
